# CLAUDE.md — PluTON v2

**Персональный мультимаркетный трекер цен** на коллекционные Telegram-подарки (TON NFT). **Не бот, не
фоновый сервис, не автоматический Deal Finder.** Пользователь один раз настраивает пресеты
`Коллекция → Модель → [несколько Фонов]`, а по кнопке «Получить цены» видит по каждой модели **колонку**
активных лотов **с разных площадок** (Telegram, Portals, Tonnel, MRKT, Getgems); внутри колонки — **секции
по каждому выбранному фону** (сгруппированы по цвету, внутри семьи тёмный→светлый), с ценой в TON + ⭐Stars + gross `~$` и чипом `× от floor`
(множитель к floor). Никакой формулы скоринга — просто «сколько стоит эта комбинация прямо сейчас на каждом
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
   - **Два источника картинок — не путать:** (a) **картинка ЛОТА** (конкретный экземпляр в колонке витрины)
     выводится из slug (`giftImageUrl`): `https://nft.fragment.com/gift/<slug-lower>.medium.jpg` — это полный
     рендер С реальным фоном лота (то что покупаешь); (b) **чистый арт МОДЕЛИ (без фона)** и **дефолтный вид
     КОЛЛЕКЦИИ до апгрейда** — из **api.changes.tg** (`src/lib/changesTg.ts`), бесплатный keyless источник
     официального арта Telegram-подарков. gift-satellite чистого арта НЕ отдаёт (probe: у моделей/фонов только
     `{name, rarityPermille}`). **Джойн к changes.tg — по `telegramId` коллекции (его даёт gift-satellite),
     НЕ по имени:** `<gift>` в эндпоинтах `/model/<id>/<model>.png` и `/original/<id>.png` принимает Telegram
     gift id, что резолвит коллекции с расхождением имён (Castle → 400 по имени, 200 по id; Durov's Cap —
     кудрявый апостроф). Имена МОДЕЛЕЙ у обоих источников из офиц. атрибутов Telegram → совпадают точно, модель
     джойним по имени. **URL детерминированы и неизменны** — строятся без сети (кэш байтов у CDN/браузера),
     `?size=64|128|256|512|1024`. Резолвер `collectionName→telegramId` (`collectionIdMap`/`collectionTelegramId`
     в `giftPreviews.ts`) читает кэшированный каталог. Миниатюра модели в dropdown/арт столбца витрины/фото
     пресета — `changesModelImageUrl`; миниатюра коллекции в dropdown — `changesOriginalImageUrl` (клиентом, без
     запроса). `/api/model-previews` отдаёт арт КАЖДОЙ модели каталога (в т.ч. без листингов) + индикативную
     мин.цену из `/search` (кэш неделя). Фото пресета (`Preset.previewImageUrl`) пишется на POST, но страницы
     ПЕРЕСЧИТЫВАЮТ его на рендере из telegramId — старые stale-URL чинятся без миграции. floor коллекции для
     dropdown — из `/history/collection-offers` (в `/api/collections`). При 404/отсутствии id — плейсхолдер
     (graceful, `GiftImage.tsx`). **Атрибуция @GiftChanges в `Footer.tsx` обязательна** (условие changes.tg).
   - **У фонов в API есть только `name` + `rarityPermille`, цвета/hex НЕТ** (probe). Цветные образцы фонов
     берутся из захардкоженной палитры Telegram-фонов `src/lib/backdropColors.ts` (имя→центральный hex,
     сортировка **по цветовой семье (hue), внутри семьи тёмный→светлый по яркости** — одинаковые цвета
     идут рядом; ахроматичные серые/чёрные/белые — после цветных, неизвестное имя → серый fallback +
     название текстом). Общая `sortBackdropsDarkToLight` применяется во ВСЕХ местах (мультиселект формы,
     чипы пресетов, секции столбцов витрины) — чтобы порядок фонов был единым.
   - **Каталог кэшируется** в `Setting`-строке (`gs_cache:*`, TTL 6ч) со **stale-on-error** — dropdown'ы не
     бьются в rate limits и переживают падение источника (`src/lib/gsCache.ts`).
   - **tonapi (`src/lib/tonapi.ts`) — только (a) курс `ton_usd` для $/⭐ и (b) legacy-скан** (см. инв. 8).
     Legacy-детали tonapi (raw→friendly адреса, `is_wallet`-фантомы, `marketUrl`) живут в `worker/scan.ts`
     и к витрине отношения не имеют.

3. **Цена = ASK на ПОКУПКУ → три значения TON + ⭐Stars + gross `~$`, БЕЗ net-семантики.** Форматтер —
   `src/lib/format.ts` (`formatBuyPriceParts`, `tonToUsd`, `tonToStars`); компонент — `src/components/LotPrice.tsx`.
   `$ = priceTon × ton_usd` (gross, покупателю), `⭐ = priceTon × ton_usd / stars_usd` (из settings).
   **Никаких голых TON в UI** — TON всегда с ⭐/$. Чип `× от floor` (`FloorChip.tsx` + `formatFloorMultiple`):
   множитель `1 + (price-floor)/floor` → `1.24×` / `0.88×`, зелёный ниже floor (<1×) / красный выше (>1×).
   В БД хранится `floorDeviationPct` (процент), множитель считается в UI. Deal Score / премия за редкость
   **удалены** (рынок floor-driven,
   продукт — трекер, не Deal Finder). `scoring.ts` оставлен только со статистикой (median/percentile/computeRarity)
   для legacy-скана.

4. **Сбор только по кнопке. Никакого фонового поллинга/крона.** Триггер — POST `/api/prices`; статус
   (поллинг) — GET `/api/prices`. Запуск воркера абстрагирован в `src/lib/trigger.ts`: **прод**
   (`WORKER_URL` задан) → HTTP-сигнал Railway (`POST /run?job=prices`, Bearer `WORKER_TOKEN`); **локально**
   (`WORKER_URL` пуст) → `spawn`. Джоба стартует только по сигналу. Cooldown/running-guard живут в
   `/api/prices`, воркер-сервер их не дублирует. **`PriceRun{running}` создаётся синхронно в роуте ДО
   спавна** (не в воркере) и его `runId` прокидывается воркеру (`--run-id` локально / `&runId=` в прод) —
   иначе два быстрых POST спавнили два прогона (TOCTOU). Осиротевшую `running`-строку (воркер упал) роут
   считает мёртвой через `STALE_RUNNING_MS` (10 мин), чтобы кнопка не залипала. Legacy-скан — тем же путём
   (`job=scan`, `/api/scan`).

5. **Прогон цен → снапшот в БД, витрина читает последний прогон.** `worker/prices.ts`: для каждого
   **пресета × 5 маркетов × каждого фона** (отдельный `/search` на фон — секция гарантированно показывает
   свои лоты без обрезки лимитом 50; маркеты параллельно, per-market лимитер) тянет лоты, считает
   `priceStars/priceUsd/floorTon/floorDeviationPct`, пишет `MarketListing` под `runId`; статус/деградацию —
   в `PriceRun` (`marketStatus[presetId][market] = ok|failed` — degraded per-столбец/модель, НЕ по коллекции).
   Старые снапшоты чистятся (остаётся последний run). Витрина (`src/app/page.tsx`) читает последний `PriceRun`
   + его `MarketListing`, группирует `presetId → backdropName` (столбец на модель, секции по фонам), собирает
   сериализуемые `columns` и отдаёт их клиентскому `Showcase`.
   - **Панель «Фильтр» (`src/components/Showcase.tsx`) — ГЛОБАЛЬНАЯ, чисто клиентская.** Одна кнопка-тулбар
     над сеткой (только когда есть пресеты) с поповером: (a) сортировка лотов по цене возр./убыв. и (b) 5
     чекбоксов площадок вкл/выкл. Обе настройки применяются одинаково ко ВСЕМ колонкам/секциям разом через
     `useMemo`-деривацию над уже загруженными лотами — **без запросов/API/БД** (фильтр/сортировка — это только
     преобразование вида, данные не перезапрашиваются). Выбор помнится в `localStorage`
     (`pluton:showcase-filter:v1`, гидрация в `useEffect` после монтирования → нет SSR-mismatch; дефолт = все
     площадки, цена по возр.). Секция, опустевшая ИЗ-ЗА фильтра, показывает «Нет активных лотов» (колонки НЕ
     прячем — стабильный layout). **Выбор направления сортировки закрывает поповер** (иначе на коротком столбце
     панель перекрывает результат и кажется, что не применилось); чекбоксы площадок (мультивыбор) — не закрывают.
     Degraded-колонки фильтр не затрагивает (меняет только `sections`, `degraded` пробрасывается нетронутым).

6. **Graceful degradation обязателен.** Маркет вернул `[]` → нет лотов. Маркет упал (429/5xx/timeout) →
   `marketStatus[presetId][market]=failed`, лоты других маркетов показываем. **Все маркеты пресета/столбца
   упали → колонка «Источник временно недоступен»** (отдельно от пустого «Нет активных лотов»). Пресеты валидируются
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
  (Мои пресеты). API-роуты: `api/collections/` (список + floor + курсы) + `api/attributes/` (dropdown'ы из
  gift-satellite, кэш), `api/model-previews/` (арт КАЖДОЙ модели из changes.tg + мин.цена из `/search`),
  `api/presets/` (GET/POST — upsert по коллекция+модель, повторное добавление **сливает** наборы фонов
  union'ом, не заменяет; POST заполняет `previewImageUrl` арт'ом модели) + `api/presets/[id]/` (DELETE),
  `api/prices/` (триггер+статус),
  `api/scan/` (legacy-триггер). Серверные страницы: `force-dynamic` **+** `unstable_noStore()`.
- `src/components/` — витрина: `GetPricesButton` (триггер+поллинг, устойчив к смене вкладки через
  `visibilitychange`), `Showcase` (клиентская обёртка сетки: глобальная панель «Фильтр» — сортировка по цене
  + выбор площадок, localStorage; см. инв. 5), `PresetColumn` (столбец=модель, секции по фонам)/`LotCard`/
  `LotPrice`/`FloorChip` (× к floor)/`GiftImage`; пресеты: `PresetForm` (каскад `CollectionSelect`→`ModelSelect`→
  `BackdropMultiSelect`; первые два — кастомные dropdown'ы с миниатюрами/мин.ценой, без панели превью),
  `PresetList` (удаление, фото модели через `GiftImage`, чипы-образцы фонов); каркас: `Nav`, `Footer`
  (в т.ч. обязательная атрибуция @GiftChanges).
- `src/lib/` — `db.ts` (Prisma+Neon), `giftSatellite.ts` (осн. источник), `markets.ts` (client-safe
  константы маркетов `Market`/`MARKETS`/`marketLabel` — без `process.env`/сети; `giftSatellite` их
  РЕ-ЭКСПОРТИРУЕТ, поэтому существующие импорты `from "@/lib/giftSatellite"` не тронуты, а клиентский
  `Showcase` берёт их отсюда, не таща API-клиент в бандл), `gsCache.ts` (кэш каталога),
  `changesTg.ts` (детерм. URL арта модели/коллекции из api.changes.tg по telegramId), `giftPreviews.ts`
  (резолвер `collectionName→telegramId` из кэш-каталога + индикативная мин.цена модели из `/search`),
  `rates.ts` (курсы из settings), `backdropColors.ts` (палитра фонов Telegram: имя→hex,
  сортировка по цветовой семье→тёмный→светлый), `format.ts`
  (TON+⭐+$, `formatFloorMultiple`), `tonapi.ts` (курс + legacy-скан), `scoring.ts` (только статистика/
  редкость), `trigger.ts` (прод-сигнал Railway / локальный spawn), `address.ts`.
- `worker/` — `prices.ts` (движок витрины), `scan.ts` (legacy), `persist.ts`, `inferSales.ts`,
  `server.ts` (always-on HTTP-сервер для Railway, jobs `prices|scan`).
- `prisma/` — `schema.prisma` (**12 моделей** + 6 enum; новые: `Preset` (`backdropNames String[]`, unique
  по `collectionName+modelName`), `PriceRun`, `MarketListing`; `ScanStatus` переиспользован для `PriceRun`),
  `seed.ts`.

## Прод-заметки
- Прод: Next на Vercel, воркер на always-on Railway (`worker:server`), БД — Neon. Триггер реализован
  (`src/lib/trigger.ts` → HTTP-сигнал Railway; локально — `spawn`). Инструкция — `DEPLOY.md`.
- **`GIFT_SATELLITE_KEY` нужен В ОБОИХ сервисах:** Vercel (для `/api/collections`, `/api/attributes`,
  `/api/model-previews`, валидации/фото пресетов, резолва telegramId) **и** Railway (для `worker/prices.ts`).
  `GIFT_SATELLITE_BASE_URL` опционально (дефолт уже верный). Арт подарков (`changesTg.ts` → api.changes.tg) —
  **keyless**, ключа не требует; `CHANGES_TG_BASE_URL` опционально. `DATABASE_URL` — Neon (в проде
  pooler-эндпоинт, `sslmode=require`).
- Один репозиторий, два сервиса: Vercel собирает web (`next build`), Railway — только воркер
  (`worker:server`, без `next build`). Railway build = `npm install --include=dev` (не `npm ci` —
  конфликт с cache-mount Nixpacks; `tsx` нужен воркеру в рантайме, Prisma client — через `postinstall`).
