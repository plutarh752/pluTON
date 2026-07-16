#!/usr/bin/env python3
"""
Portals-сайдкар PluTON v2 (вкладка «Объёмы»). Единственный источник РЕАЛЬНОГО объёма/продаж —
Portals (authed). Node-воркер (worker/volume.ts) спавнит этот скрипт и читает JSON из stdout.

Две сложные задачи Portals решаются готовой либой portalsmp (curl_cffi обход Cloudflare + сборка URL)
и Pyrogram (минт tma-токена). Авторизация — headless, через session-строку (TELEGRAM_SESSION), НЕ
интерактивный файл-сессии: строку один раз генерит worker/portals_login.py.

ВАЖНО: tma минтится ОДИН раз на процесс и переиспользуется на всех коллекциях (per-collection spawn
плодил бы 100+ Telegram-коннектов → медленно + риск rate-limit). Поэтому основной режим `--run`
внутри одного процесса обходит все коллекции (per-collection isPartial сохраняется — см. `capped`).

Режимы (JSON в stdout; при ошибке — текст в stderr + ненулевой exit, чтобы health-check в Node упал громко):
  --health                          → {"ok": true}   (минт tma + 1 лёгкий authed-GET)
  --collections [--limit N]         → {"collections": [<raw>...]}   (сырой список Portals)
  --run --period 24h|7d|30d [--limit N]
      → {"collections": [{name, floorTon, volume24hTon, sales:[{priceTon,model,backdrop,ts}],
                          capped: bool, budgetSkipped: bool}], "sample": <первый raw action|null>}

`capped=true`  — пагинация уперлась в per-collection кап РАНЬШЕ границы окна (объём НЕПОЛНЫЙ → isPartial).
`budgetSkipped=true` — до коллекции не дошёл общий бюджет времени прогона (её продажи не собраны → isPartial).
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import unquote

PAGE_LIMIT = int(os.environ.get("PORTALS_PAGE_LIMIT", "100"))          # actions на страницу
MAX_PAGES = int(os.environ.get("PORTALS_MAX_PAGES", "20"))            # ≤ MAX_PAGES*PAGE_LIMIT actions / коллекция
THROTTLE = float(os.environ.get("PORTALS_THROTTLE_SEC", "0.35"))     # пауза между запросами Portals
RUN_BUDGET = float(os.environ.get("PORTALS_RUN_BUDGET_SEC", "540"))  # общий бюджет прогона (сек)
PERIOD_DAYS = {"24h": 1, "7d": 7, "30d": 30}

# Хост Portals. Площадка мигрировала portals-market.com → portal-market.com (2026-07-16): у СТАРОГО
# хоста сняли DNS-запись (curl: (6) Could not resolve host). portalsmp 1.2 (последняя на PyPI) всё ещё
# хардкодит старый хост в API_URL/Origin/Referer — апгрейд пакета не спасает, поэтому переопределяем
# модульные глобалы (_patch_host). База настраивается через PORTALS_API_BASE на случай новой миграции;
# авторитетный источник актуального хоста — web_view.url мини-аппа бота @portals в Telegram.
PORTALS_API_BASE = os.environ.get("PORTALS_API_BASE", "https://portal-market.com").rstrip("/")

# Классификация ошибок Portals: сеть (DNS/таймаут/Cloudflare) vs авторизация (протухший tma). Health-check
# раньше ЛЮБОЙ провал выдавал за «протухшую сессию» и гонял пользователя перелогиниваться впустую — теперь
# Node-баннеры (src/lib/portals.ts) и UI (/volumes) показывают РАЗНОЕ по префиксу PORTALS_*_ERROR.
_NET_MARKERS = (
    "could not resolve host", "curl: (6)", "curl: (7)", "curl: (28)", "curl: (35)",
    "failed to connect", "connection refused", "connection reset", "connection aborted",
    "connection error", "connecterror", "timed out", "timeout", "read timed out",
    "temporary failure in name resolution", "name or service not known",
    "network is unreachable", "no route to host", "max retries", "ssl", "handshake",
)
_AUTH_MARKERS = (
    "401", "403", "unauthorized", "forbidden", "auth_key_unregistered", "authkeyunregistered",
    "session_revoked", "session_expired", "user_deactivated", "session_password_needed",
    "invalid tma", "invalid auth", "expired",
)


def _classify(exc) -> str:
    """Одно из "network" | "auth" | "unknown" по тексту исключения (сеть проверяем первой)."""
    s = str(exc).lower()
    if any(m in s for m in _NET_MARKERS):
        return "network"
    if any(m in s for m in _AUTH_MARKERS):
        return "auth"
    return "unknown"


def _patch_host(pm) -> None:
    """Переставить portalsmp на живой хост Portals (см. PORTALS_API_BASE). Функции либы читают API_URL/
    HEADERS как модульные глобалы на каждом вызове, поэтому патч глобалов действует на все запросы."""
    api = getattr(pm, "portalsapi", None)
    if api is None:
        import portalsmp.portalsapi as api  # noqa: PLC0415
    api.API_URL = PORTALS_API_BASE + "/api/"
    headers = getattr(api, "HEADERS", None)
    if isinstance(headers, dict):
        headers["Origin"] = PORTALS_API_BASE
        headers["Referer"] = PORTALS_API_BASE + "/"

# кандидаты ключей (точная схема Portals из этой среды не проб'илась — парсим защитно; см. риски в плане)
TS_KEYS = ("created_at", "updated_at", "listed_at", "date", "timestamp", "time")
PRICE_KEYS = ("price", "amount", "price_ton", "ton_price", "total_price")
MODEL_KEYS = ("model", "model_name", "modelName")
BACKDROP_KEYS = ("backdrop", "backdrop_name", "backdropName")
NAME_KEYS = ("name", "collection_name", "collectionName", "short_name", "title")
FLOOR_KEYS = ("floor_price", "floorPrice", "floor", "min_price")
VOLUME_KEYS = ("volume", "daily_volume", "dailyVolume", "volume_24h", "volume24h", "day_volume")


def die(msg) -> None:
    sys.stderr.write(str(msg).strip() + "\n")
    sys.exit(1)


def emit_progress(done, total, label) -> None:
    """Строка прогресса в stderr с префиксом `@P ` (Node-мост её парсит и обновляет UI-прогресс-бар).
    Отдельно от stdout, где лежит финальный JSON-результат. Best-effort — сбой печати не важен."""
    try:
        sys.stderr.write("@P " + json.dumps({"done": done, "total": total, "label": label}) + "\n")
        sys.stderr.flush()
    except Exception:  # noqa: BLE001
        pass


# ─────────────────────────── auth ───────────────────────────
async def _mint() -> str:
    from pyrogram import Client
    from pyrogram.raw.functions.messages import RequestAppWebView
    from pyrogram.raw.types import InputBotAppShortName, InputUser
    from pyrogram.raw.functions.users import GetUsers

    api_id = os.environ.get("TELEGRAM_API_ID")
    api_hash = os.environ.get("TELEGRAM_API_HASH")
    session = os.environ.get("TELEGRAM_SESSION")
    if not api_id or not api_hash or not session:
        die("TELEGRAM_API_ID / TELEGRAM_API_HASH / TELEGRAM_SESSION не заданы (см. worker/portals_login.py)")

    async with Client(
        "pluton_portals", api_id=int(api_id), api_hash=api_hash, session_string=session, in_memory=True
    ) as client:
        peer = await client.resolve_peer("portals")
        users = await client.invoke(GetUsers(id=[peer]))
        bot_raw = users[0]
        bot = InputUser(user_id=bot_raw.id, access_hash=bot_raw.access_hash)
        bot_app = InputBotAppShortName(bot_id=bot, short_name="market")
        web_view = await client.invoke(RequestAppWebView(peer=peer, app=bot_app, platform="desktop"))
        return f"tma {unquote(web_view.url.split('tgWebAppData=', 1)[1].split('&tgWebAppVersion', 1)[0])}"


def get_auth() -> str:
    try:
        import asyncio

        return asyncio.run(_mint())
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        die(f"PORTALS_{_classify(e).upper()}_ERROR: mint tma failed: {e}")


# ─────────────────────────── защитные экстракторы ───────────────────────────
def _first(d, keys):
    if not isinstance(d, dict):
        return None
    for k in keys:
        if d.get(k) not in (None, ""):
            return d[k]
    return None


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _str(v):
    return v if isinstance(v, str) and v else None


def _parse_ts(v):
    s = _str(v)
    if s:
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            pass
    n = _num(v)
    if n is not None:
        try:
            return datetime.fromtimestamp(n / (1000 if n > 1e12 else 1), tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    return None


def _nested(action):
    for nk in ("nft", "gift", "item"):
        if isinstance(action.get(nk), dict):
            return action[nk]
    return {}


def _extract_sale(action):
    nested = _nested(action)
    price = _num(_first(action, PRICE_KEYS)) or _num(_first(nested, PRICE_KEYS))
    if price is None or price <= 0:
        return None
    ts = _parse_ts(_first(action, TS_KEYS)) or _parse_ts(_first(nested, TS_KEYS))
    return {
        "priceTon": price,
        "model": _str(_first(action, MODEL_KEYS)) or _str(_first(nested, MODEL_KEYS)),
        "backdrop": _str(_first(action, BACKDROP_KEYS)) or _str(_first(nested, BACKDROP_KEYS)),
        "ts": ts.isoformat() if ts else None,
    }


def _norm_collection(raw):
    name = _str(_first(raw, NAME_KEYS))
    if not name:
        return None
    return {"name": name, "floorTon": _num(_first(raw, FLOOR_KEYS)), "volume24hTon": _num(_first(raw, VOLUME_KEYS))}


# ─────────────────────────── per-collection activity ───────────────────────────
def _collect_activity(pm, auth, window_start, collection):
    """Пройтись по sales-feed (action_types=buy) коллекции назад до границы окна. Возвращает (sales, capped, sample)."""
    sales, sample, reached = [], None, False
    for page in range(MAX_PAGES):
        if THROTTLE:
            time.sleep(THROTTLE)
        actions = pm.marketActivity(
            sort="latest",
            offset=page * PAGE_LIMIT,
            limit=PAGE_LIMIT,
            activityType="buy",
            gift_name=collection,
            authData=auth,
        )
        if not actions:
            reached = True  # feed кончился раньше окна → данные полны
            break
        if sample is None:
            sample = actions[0]
        stop = False
        for a in actions:
            if not isinstance(a, dict):
                continue
            s = _extract_sale(a)
            if s is None:
                continue
            ts = _parse_ts(s["ts"]) if s["ts"] else None
            if ts is not None and ts < window_start:
                reached = True
                stop = True
                break
            sales.append(s)
        if stop:
            break
    capped = not reached
    return sales, capped, sample


# ─────────────────────────── режимы ───────────────────────────
def cmd_health(pm) -> None:
    auth = get_auth()
    try:
        pm.collections(limit=1, authData=auth)
    except Exception as e:  # noqa: BLE001
        die(f"PORTALS_{_classify(e).upper()}_ERROR: authed probe failed: {e}")
    print(json.dumps({"ok": True}))


def cmd_collections(pm, limit) -> None:
    auth = get_auth()
    try:
        cols = pm.collections(limit=limit, authData=auth)
    except Exception as e:  # noqa: BLE001
        die(f"collections failed: {e}")
    print(json.dumps({"collections": cols}))


def cmd_run(pm, period, limit) -> None:
    days = PERIOD_DAYS.get(period)
    if days is None:
        die(f"bad period: {period}")
    window_start = datetime.now(timezone.utc) - timedelta(days=days)
    auth = get_auth()
    try:
        raw_cols = pm.collections(limit=limit, authData=auth)
    except Exception as e:  # noqa: BLE001
        die(f"collections failed: {e}")

    cols = [c for c in (_norm_collection(x) for x in (raw_cols or [])) if c]
    # сначала самые объёмные (24ч) — чтобы бюджет времени накрыл важнейшие коллекции
    cols.sort(key=lambda c: (c["volume24hTon"] or 0), reverse=True)

    started = time.monotonic()
    out, sample = [], None
    total = len(cols)
    emit_progress(0, total, "")
    for i, c in enumerate(cols):
        emit_progress(i, total, c["name"])  # что тянем прямо сейчас → живой лог в UI
        if time.monotonic() - started > RUN_BUDGET:
            c.update({"sales": [], "capped": False, "budgetSkipped": True})
            out.append(c)
            continue
        try:
            sales, capped, s = _collect_activity(pm, auth, window_start, c["name"])
        except Exception as e:  # noqa: BLE001
            die(f"marketActivity failed for {c['name']}: {e}")
        if sample is None and s is not None:
            sample = s
        c.update({"sales": sales, "capped": capped, "budgetSkipped": False})
        out.append(c)
    emit_progress(total, total, "")

    print(json.dumps({"collections": out, "sample": sample}))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--health", action="store_true")
    ap.add_argument("--collections", action="store_true")
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--limit", type=int, default=500)
    ap.add_argument("--period", default="24h")
    args = ap.parse_args()

    try:
        import portalsmp as pm
    except Exception as e:  # noqa: BLE001
        die(f"portalsmp import failed ({e}); pip install -r requirements.txt")
    _patch_host(pm)  # переставить либу на живой хост Portals (миграция домена, см. PORTALS_API_BASE)

    if args.health:
        cmd_health(pm)
    elif args.collections:
        cmd_collections(pm, args.limit)
    elif args.run:
        cmd_run(pm, args.period, args.limit)
    else:
        die("no mode: use --health | --collections | --run")


if __name__ == "__main__":
    main()
