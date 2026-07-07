# CLAUDE.md — PluTON

Веб-витрина для флиппинга коллекционных Telegram-подарков (TON NFT). **Не бот, не фоновый сервис.**
По кнопке «Скан» собираем текущие лоты/floor'ы, пишем дельта-снапшот в Postgres, считаем Deal Score,
показываем таблицу лучших сделок + калькулятор чистой прибыли. Между сканами — read-only витрина из БД.

Полный замысел и решения: `PROJECT_BRIEF.md` + план `/Users/plutarh/.claude/plans/misty-beaming-codd.md`.

## Стек
- **Next.js 15 (App Router, монолит) + React 19** + TypeScript + Tailwind + recharts.
- **Prisma 5.22 → Postgres на Neon** через **driver adapter (`@prisma/adapter-neon` + `@neondatabase/serverless`)**.
- Скан-воркер — отдельный процесс (`worker/*.ts`, запуск через `tsx`), не часть Next-рантайма.
- **Задеплоено:** Vercel (web) + Railway (worker) + Neon (БД). Инструкция и топология — `DEPLOY.md`.
  Живые URL/грабли деплоя держатся в auto-memory, не в репозитории.

## Команды
- `npm run dev` — веб (Next).
- `npm run worker:scan [-- --force] [-- <address>]` — один прогон скана (оркестратор).
- `npm run worker:rescore` — пересчёт скоринга из БД без tonapi (движок кнопки «пересчёт» в Settings).
- `npm run worker:server` — always-on воркер-сервер (прод, Railway): слушает `POST /run?job=scan|rescore`
  (Bearer `WORKER_TOKEN`) + `GET /health`. Спавнит джобу, HTTP остаётся отзывчивым (`worker/server.ts`).
- `npm run db:seed` — сид settings + watchlist (идемпотентно).
- `npm run typecheck` / `npm run build` — проверка перед завершением задач.
- Миграции применялись offline (`prisma migrate diff --from-empty …`) и через HTTP-драйвер — см. «Neon» ниже.
- `npm audit` = 0 (Next 15 закрыл advisory'и Next 14; `postcss` пришпилен через `overrides`).

## Инварианты проекта (не нарушать — за каждым стоит пойманный баг или бизнес-правило)

1. **Neon только через driver adapter по 443 — НЕ прямой TCP 5432.** На этой машине PG-порт 5432
   недоступен (SSLRequest виснет). Прямой `postgresql://…:5432` даёт P1001. Рабочий путь — Neon
   serverless-драйвер (`src/lib/db.ts`: `neonConfig.poolQueryViaFetch = true`, запросы идут по HTTP/443).
   Это штатный паттерн Neon (в т.ч. для Vercel), а не костыль. **Не «чинить» это возвратом к 5432.**
   - Под webpack Next нативные пакеты адаптера вынесены в `serverExternalPackages`
     (`next.config.mjs`; в Next 15 ключ переехал из `experimental.serverComponentsExternalPackages`
     на верхний уровень) — иначе ломается `ws` (`bufferUtil.mask is not a function`).

2. **Источник данных — только tonapi.** Getgems убрали: его неофициальный GraphQL активно блокируется
   (403, редирект на tonapi). Всё нужное (атрибуты→редкость, supply, активные листинги из нескольких
   маркетов, floor) выводится из tonapi. Клиент: `src/lib/tonapi.ts` — 1 RPS throttle, пагинация
   `limit=1000`, **дедуп по адресу** (offset-пагинация на больших коллекциях отдаёт дубли — ловили
   «Unique constraint failed on nftItemId»). Цены on-chain в **TON** (token «Gram», decimals 9).
   - **Адреса предметов из tonapi — raw (`0:hex`); в любой marketplace_url конвертируй в friendly
     (`EQ…`) через `toFriendlyAddress` (`src/lib/address.ts`, `@ton/core`).** Getgems не резолвит
     raw в ссылке — открывается пустая страница (ловили: коллекция была friendly из watchlist, а item
     raw из tonapi → рассинхрон в одном URL). NFT — контракты → **bounceable (EQ, не UQ)**. **Не
     подставляй `nftItem.address` в URL напрямую.**

3. **Скоринг = ранг/перцентиль редкости, НЕ `100/rarity_pct`.** `expected = base × (1 + Σ w_i × s_i)`,
   где `s_i` = доля предметов с более частым значением на оси (`computeRarityRank` → `expectedPriceTon`
   в `src/lib/scoring.ts`). Формула `100/pct` была ~3 итерации назад — она **взрывалась** (×400 на
   редких) и была **плоской** при лог-затухании. Ранговый вариант даёт рыночный диапазон (Plush Pepes
   ×1.06…×1.90, expected 11.7–20.9k TON). **Оси динамические** (сейчас Model/Backdrop/Symbol —
   «Number» это mint-id, не ось). Веса в settings.
   - Cold-start: `liquidityFactor` имеет пол 0.2, `confidenceFactor` берётся от размера выборки базы —
     иначе `×0` обнуляет весь Deal Score на первых сканах.
   - `base_price` — фолбэк по объёму данных: `sales_7d(≥10) → sales_30d(≥5) → listings_p25(≥5) →
     insufficient_data` (порог не пройден → лот не показываем в Deal Finder). `chooseBasePrice`.

4. **`PricePair` — единственный форматтер цен.** Все суммы в UI — пара `💎 TON (~$X net)` через
   `src/components/PricePair.tsx` / `src/lib/format.ts`. `usd_net` считается на бэке (после комиссий/
   конвертации). **Никаких голых TON/звёзд в интерфейсе.**

5. **Скан только по кнопке. Никакого фонового поллинга/крона на сбор данных.** Триггер — POST
   `/api/scan`; статус — GET `/api/scan`. Запуск воркера абстрагирован в `src/lib/trigger.ts`:
   **прод** (`WORKER_URL` задан) → HTTP-сигнал always-on воркеру на Railway (`POST /run`, Bearer
   `WORKER_TOKEN`); **локально** (`WORKER_URL` пуст) → `spawn` отдельного процесса. Это не фоновый
   поллинг — джоба стартует только по сигналу. Пересчёт скоринга — POST `/api/rescore` тем же путём
   (`job=rescore`). Cooldown/running-guard живут в `/api/*`-роутах, воркер-сервер их не дублирует.

6. **Два разных cooldown — не путать:**
   - `cooldown_minutes` (default **15 мин**, settings) — минимум между сканами. Guard в `/api/scan` и
     воркере.
   - **21-дневный вывод звёзд** — бизнес-правило Stars-сегмента (V2), к частоте сканов отношения не
     имеет. В расчёте профита это стоимость холда, не UI-таймер.

7. **`inferSales` даёт ВМЕНЁННЫЕ продажи (`confidence='inferred'`), не подтверждённые.** tonapi не
   отдаёт priced-историю продаж → продажу выводим кросс-скан дельтой: листинг был active → исчез +
   сменился владелец (`owner != seller_address` из эскроу) = продажа по последней цене
   (`priceKind='ask_eq_fill'`); `owner == seller` = делист. Поле `confidence` существует, чтобы
   будущий надёжный источник писал `'confirmed'` и **не смешивался** с inferred в запросах. Слепая
   зона: «появился и продан между сканами» не ловится → `liquidity_factor` это **нижняя оценка**.
   Логика: `worker/inferSales.ts`.

8. **Дельта-хранение (не полные снапшоты):**
   - `listings` — канонический **текущий стейт** (по одному active-листингу на NFT).
   - `listing_events` — **append-only лог дельт**, ключ `scanId` (new/price_up/price_down/reappeared/
     sold/delisted). Scan Diff строится из него по `scanId`, O(изменений) а не O(лотов).
   - Детект «ушедших»: в конце скана active-листинг с `lastSeenScanId != текущий` (в рамках
     отсканированных коллекций) → sold/delisted.

## Структура
- `src/app/` — экраны: `scan/` (Scan Control), `deals/` (Deal Finder, главный), `diff/` (Scan Diff),
  `collections/`, `settings/`; API-роуты: `api/scan/` (триггер+статус), `api/rescore/` (пересчёт),
  `api/settings/` (GET/PUT настроек из формы).
  Серверные страницы: `export const dynamic = "force-dynamic"` **+** `unstable_noStore()` (иначе dev
  отдаёт устаревший рендер после скана — ловили «Collections показывает 0»).
- `src/components/` — `PricePair.tsx` (пары цен), `ScanButton.tsx` (клиент, поллинг статуса),
  `SettingsForm.tsx` (клиентская форма Settings → `PUT /api/settings` → «пересчитать»).
- `src/lib/` — `db.ts` (Prisma+Neon), `scoring.ts` (чистый скоринг, шарится с воркером),
  `tonapi.ts`, `format.ts`, `trigger.ts` (прод-сигнал Railway / локальный spawn, см. инвариант 5).
- `worker/` — `scan.ts` (оркестратор), `persist.ts` (chunked upsert), `inferSales.ts`, `rescore.ts`,
  `server.ts` (always-on HTTP-сервер для Railway).
- `prisma/` — `schema.prisma` (9 моделей + 6 enum, `previewFeatures = ["driverAdapters"]`), `seed.ts`.

## Прод-заметки
- Воркер долгий (~7–10 мин на 4 коллекции) — не влезает в serverless. Прод: Next на Vercel, воркер
  на always-on Railway (`worker:server`), БД — Neon. Прод-триггер **реализован** (`src/lib/trigger.ts`
  → HTTP-сигнал Railway; локально — `spawn`). Полная инструкция и топология — `DEPLOY.md`.
- `DATABASE_URL` — Neon connection string (в `.env`/env сервисов, `sslmode=require`; в проде — **pooler**-эндпоинт).
- Один репозиторий, два сервиса: Vercel собирает web (`next build`), Railway — только воркер
  (`worker:server`, без `next build`). Railway build = `npm install --include=dev` (не `npm ci` —
  конфликт с cache-mount Nixpacks; `tsx` нужен воркеру в рантайме, Prisma client — через `postinstall`).
