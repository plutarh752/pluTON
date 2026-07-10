# CLAUDE.md — PluTON v2

**Персональный мультимаркетный трекер цен** на коллекционные Telegram-подарки (TON NFT). **Не бот, не
фоновый сервис, не автоматический Deal Finder.** Пользователь один раз настраивает пресеты
`Коллекция → Модель → Фон`, а по кнопке «Получить цены» видит по каждому пресету колонку активных лотов
**с разных площадок** (Telegram, Portals, Tonnel, MRKT, Getgems), с ценой в TON + ⭐Stars + gross `~$` и
чипом `% от floor`. Никакой формулы скоринга — просто «сколько стоит эта комбинация прямо сейчас на каждом
маркете». Между прогонами — read-only витрина из БД.

Полный план v2: `/Users/plutarh/.claude/plans/sorted-sleeping-sketch.md`. История v1 (Deal Finder) —
в git и auto-memory `[[pluton-v2-giftsatellite]]`.

## Стек
- **Next.js 15 (App Router, монолит) + React 19** + TypeScript + Tailwind + lucide-react.
- Шрифты **Geist** (текст/заголовки) + **JetBrains Mono** (лейблы/цифры) через `next/font/google`.
  Дизайн Mono-Light Minimalist — токены в `tailwind.config.ts` (из Stitch-экспорта).
- **Prisma 5.22 → Postgres на Neon** через **driver adapter (`@prisma/adapter-neon` + `@neondatabase/serverless`)**.
- Воркер — отдельный процесс (`worker/*.ts`, запуск через `tsx`), не часть Next-рантайма.
- **Задеплоено:** Vercel (web) + Railway (worker) + Neon (БД). Топология — `DEPLOY.md`.
  Живые URL/грабли деплоя держатся в auto-memory, не в репозитории.

## Команды
- `npm run dev` — веб (Next).
- `npm run worker:prices [-- --force]` — один прогон «Получить цены» (gift-satellite, движок витрины).
- `npm run worker:scan [-- --force] [-- <address>]` — legacy tonapi-скан (каталог/on-chain/дельты, вне пути витрины).
- `npm run worker:server` — always-on воркер-сервер (прод, Railway): слушает `POST /run?job=prices|scan`
  (Bearer `WORKER_TOKEN`) + `GET /health`. Спавнит джобу, HTTP остаётся отзывчивым (`worker/server.ts`).
- `npm run db:seed` — сид settings + watchlist (идемпотентно).
- `npm run typecheck` / `npm run build` — проверка перед завершением задач. `npm audit` = 0.
- Миграции применяются **offline** (`prisma migrate diff --from-schema-datamodel <старая> --to-schema-datamodel
  prisma/schema.prisma --script`) и через **HTTP-драйвер** (по одному DDL-стейтменту), не прямой 5432 — см. инвариант 1.

## Инварианты проекта (не нарушать — за каждым стоит пойманный баг или бизнес-правило)

1. **Neon только через driver adapter по 443 — НЕ прямой TCP 5432.** На этой машине PG-порт 5432
   недоступен (SSLRequest виснет). Прямой `postgresql://…:5432` даёт P1001. Рабочий путь — Neon
   serverless-драйвер (`src/lib/db.ts`: `neonConfig.poolQueryViaFetch = true`, запросы идут по HTTP/443).
   Это штатный паттерн Neon (в т.ч. для Vercel), а не костыль. **Не «чинить» это возвратом к 5432.**
   - Под webpack Next нативные пакеты адаптера вынесены в `serverExternalPackages` (`next.config.mjs`;
     в Next 15 ключ переехал из `experimental.serverComponentsExternalPackages` на верхний уровень) —
     иначе ломается `ws` (`bufferUtil.mask is not a function`).

2. **Источник новой механики — gift-satellite.dev (мультимаркет). tonapi — вспомогательный.**
   `src/lib/giftSatellite.ts`: auth-заголовок **`Authorization: Token <GIFT_SATELLITE_KEY>` (НЕ Bearer)**;
   базовый URL **`https://gift-satellite.dev/api`** (подтверждён probe'ом; `api.gift-satellite.dev` НЕ
   резолвится; переопределяется `GIFT_SATELLITE_BASE_URL`). Per-endpoint троттлинг под лимиты: markets 2/s,
   `tg` 1/1.5s, collection-offers 1/s, gift 4/s. Эндпоинты: `/gift/collections`, `/gift/collection/:name`
   (модели/фоны для dropdown'ов), `/search/{tg,portals,tonnel,mrkt,getgems}/:collection?models=&backdrops=`
   (≤50 лотов, `normalizedPrice` в TON), `/history/collection-offers` (floor по маркетам).
   - **Имена коллекций/моделей/фонов в dropdown и в фильтре `/search` — из ОДНОГО источника (gift-satellite),
     поэтому совпадают точно. Мешать с tonapi-атрибутами НЕЛЬЗЯ** (разное написание → 0 совпадений). Имена
     коллекций С пробелами (`"Plush Pepe"`), `slug` — без (`PlushPepe-310`). Поля `link` в листинге нет.
   - **Картинка лота выводится из slug** (`giftImageUrl`): `https://nft.fragment.com/gift/<slug-lower>.medium.jpg`
     (подтверждён 200); при 404 UI показывает плейсхолдер-плитку (graceful, `GiftImage.tsx`).
   - **Каталог кэшируется** в `Setting`-строке (`gs_cache:*`, TTL 6ч) со **stale-on-error** — dropdown'ы не
     бьются в rate limits и переживают падение источника (`src/lib/gsCache.ts`).
   - **tonapi (`src/lib/tonapi.ts`) — только (a) курс `ton_usd` для $/⭐ и (b) legacy-скан** (см. инв. 8).
     Legacy-детали tonapi (raw→friendly адреса, `is_wallet`-фантомы, `marketUrl`) живут в `worker/scan.ts`
     и к витрине отношения не имеют.

3. **Цена = ASK на ПОКУПКУ → три значения TON + ⭐Stars + gross `~$`, БЕЗ net-семантики.** Форматтер —
   `src/lib/format.ts` (`formatBuyPriceParts`, `tonToUsd`, `tonToStars`); компонент — `src/components/LotPrice.tsx`.
   `$ = priceTon × ton_usd` (gross, покупателю), `⭐ = priceTon × ton_usd / stars_usd` (из settings).
   **Никаких голых TON в UI** — TON всегда с ⭐/$. Чип `% от floor` (`FloorChip.tsx`): `(price-floor)/floor`,
   зелёный ниже floor / красный выше. Deal Score / премия за редкость **удалены** (рынок floor-driven,
   продукт — трекер, не Deal Finder). `scoring.ts` оставлен только со статистикой (median/percentile/computeRarity)
   для legacy-скана.

4. **Сбор только по кнопке. Никакого фонового поллинга/крона.** Триггер — POST `/api/prices`; статус
   (поллинг) — GET `/api/prices`. Запуск воркера абстрагирован в `src/lib/trigger.ts`: **прод**
   (`WORKER_URL` задан) → HTTP-сигнал Railway (`POST /run?job=prices`, Bearer `WORKER_TOKEN`); **локально**
   (`WORKER_URL` пуст) → `spawn`. Джоба стартует только по сигналу. Cooldown/running-guard живут в
   `/api/prices`, воркер-сервер их не дублирует. Legacy-скан — тем же путём (`job=scan`, `/api/scan`).

5. **Прогон цен → снапшот в БД, витрина читает последний прогон.** `worker/prices.ts`: для каждого
   пресета × 5 маркетов (маркеты параллельно, per-market лимитер) тянет лоты, считает `priceStars/priceUsd/
   floorTon/floorDeviationPct`, пишет `MarketListing` под `runId`; статус/деградацию — в `PriceRun`
   (`marketStatus[collection][market] = ok|failed`). Старые снапшоты чистятся (остаётся последний run).
   Витрина (`src/app/page.tsx`) читает последний `PriceRun` + его `MarketListing`, группирует по `presetId`.

6. **Graceful degradation обязателен.** Маркет вернул `[]` → нет лотов. Маркет упал (429/5xx/timeout) →
   `marketStatus=failed`, лоты других маркетов показываем. **Все маркеты коллекции упали → колонка
   «Источник временно недоступен»** (отдельно от пустого «Нет активных лотов»). Пресеты валидируются
   против gift-satellite-атрибутов; если источник недоступен — создание НЕ блокируем.

7. **Два разных cooldown — не путать:**
   - `prices.cooldown_minutes` (default **3 мин**) — минимум между прогонами «Получить цены». Guard в
     `/api/prices` и `worker/prices.ts`.
   - `scan.cooldown_minutes` (default 15 мин) — legacy tonapi-скан.
   - **21-дневный вывод звёзд** — бизнес-правило Stars-сегмента, к частоте прогонов отношения не имеет.

8. **Legacy tonapi-скан (вне пути витрины, оставлен как каталог/фолбэк).** `worker/scan.ts`: тянет
   коллекции watchlist из tonapi, считает редкость, пишет on-chain листинги (в основном Getgems) с
   **дельта-хранением** (`listings` = текущий стейт, `listing_events` = append-only лог, `scanId`-ключ) и
   **вменёнными продажами** (`inferSales`, `confidence='inferred'`). Скоринг из скана вырезан. Инварианты
   tonapi (адреса raw→friendly `EQ` через `src/lib/address.ts`; `is_wallet`-sale исключаем как фантомы —
   ловили Scared Cat #15630; `marketUrl` не хардкодить на getgems) действуют внутри скана. Витрина эти
   данные НЕ читает (риск рассинхрона имён с gift-satellite).

## Структура
- `src/app/` — 2 экрана: `/` (Витрина — `page.tsx`, горизонтальные колонки-пресеты), `/presets`
  (Мои пресеты). API-роуты: `api/collections/` + `api/attributes/` (dropdown'ы из gift-satellite, кэш),
  `api/presets/` (GET/POST) + `api/presets/[id]/` (DELETE), `api/prices/` (триггер+статус),
  `api/scan/` (legacy-триггер). Серверные страницы: `force-dynamic` **+** `unstable_noStore()`.
- `src/components/` — витрина: `GetPricesButton` (триггер+поллинг), `PresetColumn`/`LotCard`/`LotPrice`/
  `FloorChip`/`GiftImage`; пресеты: `PresetForm` (каскад Коллекция→Модель→Фон), `PresetList` (удаление);
  каркас: `Nav` (TopNav/SideNav/MobileNav), `Footer`.
- `src/lib/` — `db.ts` (Prisma+Neon), `giftSatellite.ts` (осн. источник), `gsCache.ts` (кэш каталога),
  `format.ts` (TON+⭐+$), `tonapi.ts` (курс + legacy-скан), `scoring.ts` (только статистика/редкость),
  `trigger.ts` (прод-сигнал Railway / локальный spawn), `address.ts`.
- `worker/` — `prices.ts` (движок витрины), `scan.ts` (legacy), `persist.ts`, `inferSales.ts`,
  `server.ts` (always-on HTTP-сервер для Railway, jobs `prices|scan`).
- `prisma/` — `schema.prisma` (**12 моделей** + 6 enum; новые: `Preset`, `PriceRun`, `MarketListing`;
  `ScanStatus` переиспользован для `PriceRun`), `seed.ts`.

## Прод-заметки
- Прод: Next на Vercel, воркер на always-on Railway (`worker:server`), БД — Neon. Триггер реализован
  (`src/lib/trigger.ts` → HTTP-сигнал Railway; локально — `spawn`). Инструкция — `DEPLOY.md`.
- **`GIFT_SATELLITE_KEY` нужен В ОБОИХ сервисах:** Vercel (для `/api/collections`, `/api/attributes`,
  валидации пресетов) **и** Railway (для `worker/prices.ts`). `GIFT_SATELLITE_BASE_URL` опционально
  (дефолт уже верный). `DATABASE_URL` — Neon (в проде pooler-эндпоинт, `sslmode=require`).
- Один репозиторий, два сервиса: Vercel собирает web (`next build`), Railway — только воркер
  (`worker:server`, без `next build`). Railway build = `npm install --include=dev` (не `npm ci` —
  конфликт с cache-mount Nixpacks; `tsx` нужен воркеру в рантайме, Prisma client — через `postinstall`).
