# Локальный запуск PluTON

Проект работает **только локально** — веб (Next.js dev-сервер) и воркер-джобы как отдельные процессы
на своей машине. Никакого облачного хостинга (раньше был Vercel + Railway) не требуется и не
поддерживается — если понадобится задеплоить в облако, это отдельная задача (история старой связки
Vercel+Railway+Neon остаётся в git-истории).

Единственный внешний сервис — **Neon** (Postgres): даже локально к нему ходят через HTTP/443
driver adapter, а не прямой TCP 5432, см. `CLAUDE.md` §1.

## 1. Переменные окружения

Скопируй `.env.example` → `.env` и заполни:

- `DATABASE_URL` — строка подключения к Neon (`...neon.tech/neondb?sslmode=require`).
- `SETTINGS_ENCRYPTION_KEY` — сгенерируй один раз (`openssl rand -hex 32`). Им шифруются/
  расшифровываются API-ключи, которые хранятся в БД (см. `CLAUDE.md` инвариант 10) — без него
  сохранённые ключи нечем расшифровать.
- `TONAPI_BASE_URL` — по умолчанию `https://tonapi.io/v2`, менять не нужно.
- `GIFT_SATELLITE_BASE_URL` — опционально, только если меняется хост источника.

`GIFT_SATELLITE_KEY`/`TONAPI_KEY`/`TELEGRAM_API_ID`/`TELEGRAM_API_HASH`/`TELEGRAM_SESSION` в `.env`
**не вписываются** — вводятся один раз через веб-форму `/settings` в самом приложении и хранятся
зашифрованными в БД.

## 2. Первый запуск

```bash
npm install
DATABASE_URL=... npm run db:seed   # settings + watchlist (идемпотентно)
npm run dev                        # веб на http://localhost:3000
```

Открой `/settings` и введи `GIFT_SATELLITE_KEY` (обязателен — без него приложение недоступно, см.
`src/lib/requireConfigured.ts`). `TONAPI_KEY` опционален (бесплатный тир 1 RPS работает и без него).

## 3. Как запускаются воркер-джобы

Кнопки в UI («Получить цены», «Скан», «Получить объём») бьют в `POST /api/prices|scan|volume`,
которые синхронно создают строку прогона (concurrency-guard) и вызывают `triggerWorker()`
(`src/lib/trigger.ts`) — тот спавнит соответствующий `tsx worker/*.ts` локальным detached-процессом.
Никакого отдельного сервера/токена не нужно — это не фоновый поллинг, джоба стартует только по
сигналу от кнопки.

Джобы можно запускать и вручную для отладки:

```bash
npm run worker:prices [-- --force]   # движок витрины (gift-satellite)
npm run worker:volume -- --period=24h|7d|30d [-- --force]   # объёмы (Portals)
npm run worker:scan [-- --force]     # legacy tonapi-скан
```

## 4. Вкладка «Объёмы» — Python-сайдкар (Portals)

Реальный объём торгов тянется из Portals через Python-сайдкар (`worker/portals_fetch.py`:
portalsmp + Pyrogram + curl_cffi), которого Node-воркер (`worker/volume.ts`) спавнит напрямую —
никакого отдельного деплоя не требуется, только локально установленный Python 3:

```bash
pip install -r requirements.txt
```

Вход в Telegram (получить session-строку). **Основной путь — прямо в приложении, консоль не нужна:**
на `/settings` введи `TELEGRAM_API_ID`/`TELEGRAM_API_HASH` (my.telegram.org), затем нажми кнопку
**«Получить»** рядом с полем «Telegram Session» → мастер спросит номер телефона → код из Telegram
(и облачный пароль, если включён 2FA). Сессия сохранится в БД автоматически. Для мастера нужен
установленный локально Python 3 (`pip install -r requirements.txt`).

Консольный фолбэк (то же, но из терминала):

```bash
npm run portals:login   # спросит TELEGRAM_API_ID/HASH (my.telegram.org) + номер + код (и 2FA, если есть)
                         # → печатает session-строку — вставь в /settings (поле «Telegram Session»)
npm run portals:health  # проверка: «✅ Portals auth OK»
```

`tma` истекает не мгновенно, но со временем протухает — health-check в начале каждого прогона
объёма громко кричит в лог («❌ PORTALS AUTH DEAD»), если сессия умерла. Тогда просто снова нажми
**«Получить»** в `/settings` (или `npm run portals:login`), чтобы обновить Telegram Session.

## 5. Проверка end-to-end

1. `/` (Витрина) → добавь пресет на `/presets` → «Получить цены» → дождись завершения прогона →
   колонки с лотами по маркетам.
2. `/volumes` → выбери период → «Получить объём» → таблица коллекций по объёму убыв.
