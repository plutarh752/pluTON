# Деплой PluTON (Vercel + Railway + Neon)

Три компонента:

| Компонент | Где | Что делает |
|---|---|---|
| **Web** (Next.js) | Vercel | Витрина + API-роуты. По кнопке «Скан»/«Пересчитать» шлёт HTTP-сигнал воркеру. |
| **Worker** (`worker/server.ts`) | Railway (always-on) | Держит скан/пересчёт: они долгие (~7 мин), в Vercel-serverless не влезают. |
| **Postgres** | Neon | Общая БД. Доступ через driver adapter по 443 (см. CLAUDE.md §1). |

Поток триггера (никакого фонового поллинга — джоба стартует только по сигналу):

```
[кнопка Скан] → Vercel POST /api/scan (cooldown/running-guard)
              → fetch WORKER_URL/run?job=scan  (Bearer WORKER_TOKEN)
              → Railway worker: spawn `tsx worker/scan.ts` → tonapi → Neon (дельты)
```

Локально WORKER_URL пуст → тот же роут запускает воркер через `spawn` (см. `src/lib/trigger.ts`).

---

## 0. Общий секрет

Сгенерируй `WORKER_TOKEN` (одинаковый на Vercel и Railway):

```bash
openssl rand -hex 32
```

## 1. Neon (БД)

Уже поднята. Нужна лишь `DATABASE_URL` (строка `...neon.tech/neondb?sslmode=require`).
Миграции применяются offline-диффом + через HTTP-драйвер (см. `prisma/migrations/`). Первичный сид:

```bash
DATABASE_URL=... npm run db:seed   # settings + watchlist (идемпотентно)
```

## 2. Railway (воркер)

1. New Project → Deploy from GitHub repo (этот репозиторий).
2. Railway подхватит `railway.json`:
   - build: `npm install --include=dev` (ставит tsx + `postinstall` генерит Prisma client;
     `npm install`, а не `npm ci` — последний конфликтует с cache-mount Nixpacks на `node_modules/.cache` → EBUSY),
   - start: `npm run worker:server`,
   - healthcheck: `/health`.
3. Variables:
   - `DATABASE_URL` — та же строка Neon.
   - `WORKER_TOKEN` — секрет из шага 0.
   - `TONAPI_BASE_URL=https://tonapi.io/v2` (и `TONAPI_KEY`, если есть).
   - `PORT` Railway задаёт сам; сервер его читает.
4. Networking → Generate Domain. Публичный URL (напр. `https://pluton-worker.up.railway.app`) → это `WORKER_URL` для Vercel.
5. Проверка: `curl https://<worker>/health` → `ok`.

## 3. Vercel (веб)

1. Import Project → этот репозиторий. Framework: Next.js (автодетект). Build/postinstall (`prisma generate`) — по умолчанию.
2. Environment Variables:
   - `DATABASE_URL` — Neon.
   - `WORKER_URL` — публичный URL воркера с Railway (шаг 2.4).
   - `WORKER_TOKEN` — тот же секрет.
   - `TONAPI_BASE_URL`, `TONAPI_KEY` (опц.).
3. Deploy.

## 4. Проверка end-to-end

1. Открой Vercel-URL → экран **Скан**.
2. Нажми «Скан» → `/api/scan` 202 → воркер на Railway начинает скан (смотри логи Railway).
3. По завершении — «Скан идёт…» гаснет, в истории новый скан, **Deal Finder** обновляется.
4. **Настройки** → правка весов → «Сохранить и пересчитать» → `/api/rescore` → воркер пересчитывает.

---

## Заметки

- **Cooldown/running-guard** живут в `/api/scan` и `/api/rescore` (Vercel). Воркер-сервер их не дублирует —
  он просто аутентифицирует сигнал и запускает джобу. Скан не запустится, пока идёт cooldown (15 мин) или
  другой скан.
- **Один репозиторий, два сервиса.** Vercel собирает web (`next build`), Railway — только воркер
  (`worker:server`, без `next build`). Оба используют один и тот же код (`worker/*`, `src/lib/*`).
- **tsx в рантайме воркера** ставится как dev-зависимость (`npm ci --include=dev`). Prisma client
  генерится через `postinstall`.
- **Docker-compose** (`docker-compose.yml`) — для локального стенда с собственным Postgres; в проде не
  используется (БД = Neon, воркер = Railway).

---

## 5. Вкладка «Объёмы» — Portals + Python на воркере (CLAUDE.md инвариант 9)

Реальный объём торгов есть только у Portals (за Cloudflare + истекающим Telegram-`tma`). Грязь изолирована
в Python-сайдкаре `worker/portals_fetch.py` (portalsmp + pyrogram + curl_cffi), который Node-воркер спавнит.
Поэтому **воркер-сервису на Railway теперь нужен Python 3**, а не только Node.

### 5.1 Одноразовый Telegram-логин (ЛИЧНО, локально)

```bash
export TELEGRAM_API_ID=...      # my.telegram.org → API development tools
export TELEGRAM_API_HASH=...
npm run portals:login           # спросит номер телефона + код (и 2FA-пароль, если включён)
# → печатает TELEGRAM_SESSION=... — скопируй в .env (локально) и в Railway-variables (прод)
npm run portals:health          # проверка: «✅ Portals auth OK»
```

`tma` истекает → health-check при старте `worker:server` и в начале каждого прогона объёма кричит в лог
громким баннером «❌ PORTALS AUTH DEAD». Тогда повтори `npm run portals:login` и обнови `TELEGRAM_SESSION`.

### 5.2 Railway (воркер): Node + Python

- Новые variables: `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION` (+ уже имеющиеся).
- Сборка Node+Python описана в `nixpacks.toml` (`python311` + `gcc`, `pip install -r requirements.txt`).
  **Проверь деплой:** в логах билда — установка portalsmp/pyrogram/curl_cffi; при старте — строка
  health-check. Если Nixpacks не подхватил Python — задай в Railway Build Command явно
  `npm install --include=dev && pip install --break-system-packages -r requirements.txt`, Start Command
  `npm run worker:server`. Если `tgcrypto` не собирается — убери его из `requirements.txt` (Pyrogram
  работает и без него, медленнее).
- Vercel `nixpacks.toml` игнорирует (web = `next build`, Python не нужен, Telegram-переменные не задавать).

### 5.3 Проверка end-to-end

1. Открой `/volumes` → дропдаун периода (24ч/7д/30д) + кнопка «Получить объём».
2. Выбери период, нажми → `POST /api/volume?period=` 202 → воркер: health-check → Portals → снапшот.
3. По завершении таблица: коллекции по объёму убыв., floor/объём (TON+$), посл. продажа, топ-3 модели,
   ссылки. У неполных (7д/30д) строк — бейдж ⚠ рядом с объёмом.
