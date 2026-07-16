import { spawn } from "node:child_process";
import path from "node:path";
import { getTelegramCreds } from "./secrets";

// Мост Node → Python-сайдкар Portals (worker/portals_fetch.py) для вкладки «Объёмы».
// Portals — единственный источник РЕАЛЬНОГО объёма/продаж, но за Cloudflare + истекающим tma-токеном;
// вся эта грязь изолирована в Python (portalsmp + Pyrogram). Здесь — только спавн, JSON-парсинг и
// health-check, который ГРОМКО падает в терминал, если Telegram-авторизация протухла (требование задачи).
//
// Схема ответов Portals из этой среды не проб'илась (Cloudflare + auth) — поля коллекций/продаж парсим
// ЗАЩИТНО по кандидатам ключей (как giftSatellite). Первый реальный прогон покажет фактическую форму:
// worker/volume.ts логирует `sample` первой продажи — при расхождении поправить кандидаты здесь/в питоне.

const PYTHON_BIN = process.env.PYTHON_BIN ?? "python3";
const SIDECAR = path.join(process.cwd(), "worker", "portals_fetch.py");

/** Прогресс из сайдкара: сколько коллекций обойдено из общего числа + текущая (для UI-лога). */
export interface SidecarProgress {
  done: number;
  total: number;
  label: string;
}

/**
 * Спавнит python-сайдкар, собирает stdout, парсит JSON. Ненулевой exit → reject со stderr-текстом.
 * `onProgress` (опц.) вызывается на каждой строке прогресса сайдкара (stderr, префикс `@P `) — так
 * тяжёлый `--run` шлёт живой прогресс в UI, не дожидаясь финального JSON. Прогресс-строки НЕ попадают
 * в текст ошибки (остальной stderr — попадает).
 */
export async function runPortalsSidecar<T = unknown>(
  args: string[],
  timeoutMs = 180_000,
  onProgress?: (p: SidecarProgress) => void
): Promise<T> {
  // Telegram-креды теперь в БД (src/lib/secrets.ts), не в env — подмешиваем их в env дочернего
  // процесса на спавне. Python-сайдкар не меняется: как читал os.environ.get(...), так и читает.
  const creds = await getTelegramCreds();
  if (!creds.apiId || !creds.apiHash || !creds.session) {
    throw new Error("telegram_not_configured: заполни Telegram API ID/Hash/Session в Настройках (/settings)");
  }
  const env = {
    ...process.env,
    TELEGRAM_API_ID: creds.apiId,
    TELEGRAM_API_HASH: creds.apiHash,
    TELEGRAM_SESSION: creds.session,
  };
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [SIDECAR, ...args], { env });
    let out = "";
    let err = ""; // stderr БЕЗ прогресс-строк (для сообщения об ошибке)
    let errBuf = ""; // буфер незавершённой stderr-строки между чанками
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`portals sidecar timeout (${timeoutMs}ms) [${args.join(" ")}]`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => {
      errBuf += d.toString();
      let idx: number;
      while ((idx = errBuf.indexOf("\n")) >= 0) {
        const line = errBuf.slice(0, idx);
        errBuf = errBuf.slice(idx + 1);
        if (line.startsWith("@P ")) {
          if (onProgress) {
            try {
              onProgress(JSON.parse(line.slice(3)) as SidecarProgress);
            } catch {
              /* битую прогресс-строку игнорируем */
            }
          }
        } else {
          err += line + "\n";
        }
      }
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`portals sidecar spawn failed (${PYTHON_BIN}): ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      err += errBuf; // возможный хвост без завершающего \n
      if (code !== 0) return reject(new Error(err.trim() || `portals sidecar exited ${code}`));
      try {
        resolve(JSON.parse(out) as T);
      } catch {
        reject(new Error(`portals sidecar bad JSON: ${out.slice(0, 300)}`));
      }
    });
  });
}

/**
 * Health-check Portals: громкий понятный отказ в терминал. РАЗЛИЧАЕТ причины (сайдкар помечает провал
 * префиксом `PORTALS_NETWORK_ERROR` / `PORTALS_AUTH_ERROR`), чтобы не гнать пользователя перелогиниваться
 * при чисто сетевом сбое Portals (DNS/таймаут/Cloudflare — ловили миграцию домена
 * portals-market.com → portal-market.com). Бросает при провале с кодом-причиной в тексте.
 */
export async function assertPortalsAuth(): Promise<void> {
  try {
    await runPortalsSidecar<{ ok: boolean }>(["--health"], 90_000);
    console.log("✅ Portals auth OK");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const bar = "═".repeat(72);
    if (msg.startsWith("telegram_not_configured")) {
      console.error(
        `\n${bar}\n⚠ TELEGRAM НЕ НАСТРОЕН — заполни API ID/Hash в /settings и нажми «Получить»\n` +
          `   рядом с полем «Telegram Session» (мастер телефон+код). Фолбэк: npm run portals:login\n${bar}\n`
      );
      throw new Error(msg);
    }
    // Сетевой сбой Portals — сессия НИ ПРИ ЧЁМ. Отдельный баннер, чтобы не отправлять чинить то, что не сломано.
    if (msg.includes("PORTALS_NETWORK_ERROR")) {
      console.error(
        `\n${bar}\n🌐 PORTALS НЕДОСТУПЕН ПО СЕТИ — это НЕ Telegram-сессия (заново входить не нужно).\n` +
          `   Хост Portals не отвечает (DNS/таймаут/Cloudflare); сессия, скорее всего, жива.\n` +
          `   1) проверь интернет и резолв хоста Portals (по умолчанию portal-market.com)\n` +
          `   2) если Portals сменил домен — задай PORTALS_API_BASE=https://<новый-хост> и повтори\n` +
          `      (актуальный хост = web_view.url мини-аппа бота @portals в Telegram)\n` +
          `   Причина: ${msg}\n${bar}\n`
      );
      throw new Error(`portals_network_down: ${msg}`);
    }
    if (msg.includes("PORTALS_AUTH_ERROR")) {
      console.error(
        `\n${bar}\n❌ PORTALS AUTH DEAD — обнови Telegram-сессию.\n` +
          `   1) в /settings нажми «Получить» у поля «Telegram Session» → пройди вход заново\n` +
          `      (фолбэк из консоли: npm run portals:login → вставь сессию в /settings)\n` +
          `   2) перезапусти воркер / прогон «Получить объём»\n` +
          `   Причина: ${msg}\n${bar}\n`
      );
      throw new Error(`portals_auth_dead: ${msg}`);
    }
    // Причина не распознана — общий баннер, БЕЗ ложного «перелогинься».
    console.error(
      `\n${bar}\n⚠ PORTALS ПРОГОН УПАЛ — причина не распознана (не сеть и не явная auth-ошибка).\n` +
        `   Проверь лог ниже; если это истёкшая сессия — обнови её в /settings.\n` +
        `   Причина: ${msg}\n${bar}\n`
    );
    throw new Error(`portals_error: ${msg}`);
  }
}

// ───────────────────────────── типы + защитный парсинг ─────────────────────────────

export interface PortalsSale {
  priceTon: number;
  model: string | null;
  backdrop: string | null;
  ts: string | null; // ISO
}

// Одна коллекция из режима `--run`: нормализованные floor/24ч-объём (сайдкар парсит защитно) + её продажи
// за окно периода. `capped` → пагинация не дошла до границы окна; `budgetSkipped` → до коллекции не дошёл
// общий бюджет времени прогона. Оба означают неполноту → isPartial в воркере.
export interface PortalsRunCollection {
  name: string;
  floorTon: number | null;
  volume24hTon: number | null;
  sales: PortalsSale[];
  capped: boolean;
  budgetSkipped: boolean;
}
export interface PortalsRun {
  collections: PortalsRunCollection[];
  sample: unknown; // первый raw action — для отладки схемы на первом реальном прогоне
}

/**
 * Основной вызов вкладки «Объёмы»: сайдкар минтит tma ОДИН раз, тянет коллекции Portals и по каждой
 * проходит sales-feed за окно периода. Тяжёлый (per-collection пагинация под общим бюджетом времени) —
 * см. worker/portals_fetch.py. Таймаут щедрый: бюджет прогона + запас на минт/сеть.
 */
export async function fetchPortalsRun(
  period: string,
  limit = 500,
  onProgress?: (p: SidecarProgress) => void
): Promise<PortalsRun> {
  const budgetSec = Number(process.env.PORTALS_RUN_BUDGET_SEC ?? 540);
  const timeoutMs = Math.round((budgetSec + 180) * 1000);
  const d = await runPortalsSidecar<PortalsRun>(
    ["--run", "--period", period, "--limit", String(limit)],
    timeoutMs,
    onProgress
  );
  const collections = Array.isArray(d?.collections)
    ? d.collections.map((c) => ({
        name: String(c?.name ?? ""),
        floorTon: typeof c?.floorTon === "number" ? c.floorTon : null,
        volume24hTon: typeof c?.volume24hTon === "number" ? c.volume24hTon : null,
        sales: Array.isArray(c?.sales) ? c.sales : [],
        capped: !!c?.capped,
        budgetSkipped: !!c?.budgetSkipped,
      }))
    : [];
  return { collections: collections.filter((c) => c.name), sample: d?.sample ?? null };
}
