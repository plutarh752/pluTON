# CLAUDE.md — PluTON v2

**Персональный мультимаркетный трекер цен** на коллекционные Telegram-подарки (TON NFT). **Не бот, не
фоновый сервис, не автоматический Deal Finder.** Пользователь один раз настраивает пресеты
`Коллекция → Модель → [несколько Фонов]`, а по кнопке «Получить цены» видит по каждой модели **колонку** —
ОДИН плоский список активных лотов **с разных площадок** (Telegram, Portals, Tonnel, MRKT, Getgems) по ВСЕМ
выбранным фонам сразу, отсортированный по цене (фон каждого лота — бейдж на его карточке, не группировка
секциями — см. инв. 5), с ценой в TON + ⭐Stars + gross `~$` и чипом `× от floor` (множитель к floor).
Никакой формулы скоринга — просто «сколько стоит эта комбинация прямо сейчас на каждом маркете». Между
прогонами — read-only витрина из БД.

Полный план v2: `/Users/plutarh/.claude/plans/sorted-sleeping-sketch.md`. История v1 (Deal Finder) —
в git и auto-memory `[[pluton-v2-giftsatellite]]`.

## Язык общения
Когда задача выполнена (итог/summary в конце работы) — отвечать **на русском**, независимо от языка
предыдущих сообщений в диалоге.

## Подготовка к очистке диалога (перед `/clear`)
Когда пользователь просит «подготовить диалог к очистке» (или похоже — «сохранись перед clear»), выполнить
**полное сохранение** в таком порядке: (1) обновить этот `CLAUDE.md` под текущее состояние кода (новые
инварианты/файлы/команды из проделанной работы), (2) закоммитить ВСЁ незакоммиченное (`git add -A`, осмысленный
коммит с co-author), (3) запушить в origin текущей ветки. Цель — новый диалог стартует с актуальной
документацией и чистого рабочего дерева, ничего из сделанного не теряется.

## Стек
- **Next.js 15 (App Router, монолит) + React 19** + TypeScript + Tailwind + lucide-react.
- Шрифты **Geist** (текст/заголовки) + **JetBrains Mono** (лейблы/цифры) через `next/font/google`.
  Дизайн Mono-Light Minimalist — токены в `tailwind.config.ts` (из Stitch-экспорта).
- **Prisma 5.22 → Postgres на Neon** через **driver adapter (`@prisma/adapter-neon` + `@neondatabase/serverless`)**.
- Воркер — отдельный процесс (`worker/*.ts`, запуск через `tsx`), не часть Next-рантайма.
- **Запускается только локально** — веб (`npm run dev`) и воркер-джобы как отдельные процессы на
  своей машине, без облачного хостинга. Инструкция — `DEPLOY.md`.

## Команды
- `npm run dev` — веб (Next).
- `npm run worker:prices [-- --force]` — один прогон «Получить цены» (gift-satellite, движок витрины).
- `npm run worker:volume -- --period=24h|7d|30d [-- --force]` — один прогон «Получить объём» (Portals,
  движок вкладки «Объёмы»). Первым шагом — health-check Portals-авторизации (см. инвариант 9).
- `npm run portals:health` — ручной health-check Portals-tma («✅ Portals auth OK» или громкий баннер + exit 1).
- **Основной путь получить `TELEGRAM_SESSION` — кнопка «Получить» в `/settings`** (мастер телефон→код→2FA
  прямо в UI, консоль не нужна — см. инв. 12). `npm run portals:login` остаётся консольным ФОЛБЭКОМ:
  одноразовый интерактивный вход в Telegram (ввод телефона+кода ЛИЧНО) → печатает session-строку для
  headless-минта tma; вставляется в `/settings` (не в `.env` — см. инв. 10). `TELEGRAM_API_ID`/
  `TELEGRAM_API_HASH` вводятся там же (my.telegram.org).
- `npm run worker:scan [-- --force] [-- <address>]` — legacy tonapi-скан (каталог/on-chain/дельты, вне пути витрины).
- `npm run db:seed` — сид settings + watchlist (идемпотентно).
- `npm run onboarding:reset` / `onboarding:restore` — симуляция первого запуска (бэкап+чистка секретов и
  флага онбординга) и откат (инв. 11). Для проверки мастера `/onboarding`, не для прода.
- `npm run typecheck` / `npm run build` — проверка перед завершением задач. `npm audit` = 0.
- Миграции применяются **offline** (`prisma migrate diff --from-schema-datamodel <старая> --to-schema-datamodel
  prisma/schema.prisma --script`) и через **HTTP-драйвер** (по одному DDL-стейтменту), не прямой 5432 — см. инвариант 1.

## Инварианты проекта (не нарушать — за каждым стоит пойманный баг или бизнес-правило)

1. **Neon только через driver adapter по 443 — НЕ прямой TCP 5432.** На этой машине PG-порт 5432
   недоступен (SSLRequest виснет). Прямой `postgresql://…:5432` даёт P1001. Рабочий путь — Neon
   serverless-драйвер (`src/lib/db.ts`: `neonConfig.poolQueryViaFetch = true`, запросы идут по HTTP/443).
   Это штатный паттерн Neon, а не костыль. **Не «чинить» это возвратом к 5432.**
   - Под webpack Next нативные пакеты адаптера вынесены в `serverExternalPackages` (`next.config.mjs`;
     в Next 15 ключ переехал из `experimental.serverComponentsExternalPackages` на верхний уровень) —
     иначе ломается `ws` (`bufferUtil.mask is not a function`).

2. **Источник каталога/floor — Giftstat (keyless, Слой А). Источник конкретных лотов под Модель+Фон —
   gift-satellite.dev (платный ключ, Слой Б). Разделены сознательно — Giftstat принципиально не может
   закрыть второе.**
   - **Giftstat** (`src/lib/giftstat.ts`, `https://api.giftstat.app`, БЕЗ ключа/авторизации — CORS открыт,
     10 запросов подряд не ловят 429) — основной источник каталога: `giftstatCollections()`
     (`/current/collections` → имя+telegramId+`blockchain_address`; ~21% строк без имени — нессылочные
     подарки без NFT-коллекции, отфильтрованы), `giftstatModelsAndBackdrops(collection)`
     (`/current/collections/models`+`/backdrops`; сервер НЕ фильтрует по коллекции — параметр молча
     игнорируется, тянем полные списки 7-8 тыс. строк ОДИН раз и группируем сами), `giftstatModelFloor
     (collection)` (индикативный floor модели, блендед по фонам/площадкам, БЕЗ разбивки — `/current/
     collections/models/floor`), `giftstatFloorMap()` (MIN floor коллекции по 4 площадкам —
     `/current/collections/floor?marketplace=portals|tonnel|fragment|getgems`, каждая опрашивается
     независимо, падение одной не роняет остальные). Все функции кэшируются через общий `cachedGs()`
     (`gsCache.ts`, TTL+stale-on-error, источник-агностичный).
   - **gift-satellite** (`src/lib/giftSatellite.ts`: auth-заголовок **`Authorization: Token
     <GIFT_SATELLITE_KEY>` (НЕ Bearer)**; ключ асинхронно из БД через `getGiftSatelliteKey()`
     (`src/lib/secrets.ts`), НЕ из `process.env` — см. инв. 10; базовый URL `https://gift-satellite.dev/api`,
     переопределяется `GIFT_SATELLITE_BASE_URL`) сужен до ЕДИНСТВЕННОГО назначения: `searchMarket(market,
     collection, {models,backdrops})` → `/search/{tg,portals,tonnel,mrkt,getgems}/:collection?models=
     &backdrops=` (≤50 лотов, `normalizedPrice` в TON) — конкретные активные лоты (slug/giftId) под
     комбинацию Модель+Фон. **Это единственное, чего Giftstat не отдаёт** (проверено пробами 4
     гипотетических combo-путей → все 404; поля `backdrop` нет в `models/floor`) — используется ТОЛЬКО в
     `worker/prices.ts` (ядро витрины). Плюс health-check валидности ключа в `api/settings/route.ts`
     (`getCollections()` после сохранения). Per-endpoint троттлинг под лимиты: markets 2/s, `tg` 1/1.5s,
     gift 4/s.
   - **Набор площадок у двух источников РАЗНЫЙ, не 1:1** — Giftstat floor знает portals/tonnel/fragment/
     getgems (нет tg/mrkt), `/search` знает tg/portals/tonnel/mrkt/getgems (нет fragment). Floor-чип
     (Giftstat) и колонки витрины (`/search`) поэтому иногда расходятся в том, что считают «рынком» —
     заведомое расхождение источников, не баг (по аналогии с инв.9 про объёмы — не «чинить»).
   - **Гейт `requireGiftSatelliteConfigured` НЕ ослаблен**, хотя каталог/dropdown'ы/floor/валидация
     пресетов technически больше не требуют ключа — сознательно отложено на будущую задачу онбординга
     (см. инв. 10).
   - Имена коллекций/моделей/фонов — из Giftstat, один источник и для dropdown, и для валидации пресетов
     (консистентны между собой по построению). Имена коллекций С пробелами (`"Plush Pepe"`),
     `collection_slug` — без. У моделей/фонов Giftstat отдаёт `{name, rarity}` → маппится в
     `{name, rarityPermille}` (та же permille-конвенция, что раньше у gift-satellite).
   - **Два источника картинок — не путать:** (a) **картинка ЛОТА** (конкретный экземпляр в колонке витрины,
     из `/search` gift-satellite) выводится из slug (`giftImageUrl`):
     `https://nft.fragment.com/gift/<slug-lower>.medium.jpg` — полный рендер С реальным фоном лота (то что
     покупаешь); (b) **чистый арт МОДЕЛИ (без фона)** и **дефолтный вид КОЛЛЕКЦИИ до апгрейда** — из
     **api.changes.tg** (`src/lib/changesTg.ts`), бесплатный keyless источник официального арта Telegram-
     подарков. Ни Giftstat, ни gift-satellite чистого арта не отдают. **Джойн к changes.tg — по
     `telegramId` коллекции (теперь даёт Giftstat: `str_id`/`id` из `/current/collections` — join-ключ
     подтверждён пробой на 17 коллекциях вразброс по каталогу: `str_id` → `changes.tg/original/<id>.png` →
     200 у всех 17; отрицательный контроль на случайном id → 400), НЕ по имени:** `<gift>` в эндпоинтах
     `/model/<id>/<model>.png` и `/original/<id>.png` принимает Telegram gift id, что резолвит коллекции
     с расхождением имён (Castle → 400 по имени, 200 по id; Durov's Cap — кудрявый апостроф). Имена МОДЕЛЕЙ
     у обоих источников из офиц. атрибутов Telegram → совпадают точно (включая NBSP/кудрявые апострофы —
     changes.tg отдаёт 200 в обоих написаниях, проверено на выборке), модель джойним по имени. **URL
     детерминированы и неизменны** — строятся без сети (кэш байтов у CDN/браузера), `?size=64|128|256|512|
     1024`. Резолвер `collectionName→telegramId` (`collectionIdMap`/`collectionTelegramId` в
     `giftPreviews.ts`) читает кэшированный каталог Giftstat. Миниатюра модели в dropdown/арт столбца
     витрины/фото пресета — `changesModelImageUrl`; миниатюра коллекции в dropdown —
     `changesOriginalImageUrl` (клиентом, без запроса). `/api/model-previews` отдаёт арт КАЖДОЙ модели
     каталога (в т.ч. без листингов) + индикативный floor модели из Giftstat (`giftstatModelFloor`).
     Фото пресета (`Preset.previewImageUrl`) пишется на POST, но страницы ПЕРЕСЧИТЫВАЮТ его на рендере из
     telegramId — старые stale-URL чинятся без миграции. floor коллекции для dropdown — из
     `giftstatFloorMap()` (в `/api/collections`). При 404/отсутствии id — плейсхолдер (graceful,
     `GiftImage.tsx`). **Атрибуция @GiftChanges в `Footer.tsx` обязательна** (условие changes.tg).
   - **У фонов в API есть только `name` + `rarity`, цвета/hex НЕТ** (probe, оба источника). Цветные образцы
     фонов берутся из захардкоженной палитры Telegram-фонов `src/lib/backdropColors.ts` (имя→центральный hex,
     сортировка **по цветовой семье (hue), внутри семьи тёмный→светлый по яркости** — одинаковые цвета
     идут рядом; ахроматичные серые/чёрные/белые — после цветных, неизвестное имя → серый fallback +
     название текстом). Общая `sortBackdropsDarkToLight` применяется во ВСЕХ местах (мультиселект формы,
     чипы пресетов, секции столбцов витрины) — чтобы порядок фонов был единым.
   - **Два уровня кэша каталога — не путать.** (a) **МЕЛКИЕ per-collection/collection-list результаты**
     (список коллекций, floor по коллекциям, атрибуты ОДНОЙ коллекции — то, что реально отдаётся клиенту)
     кэшируются в `Setting`-строке (`gs_cache:*`, TTL 6ч, floor 10 мин) со stale-on-error через
     `src/lib/gsCache.ts`. (b) **ТРИ ГЛОБАЛЬНЫХ списка ВНУТРИ `giftstat.ts`** (`/current/collections/models`
     ~7355 строк, `/backdrops` ~8269, `/models/floor` ~7488 — их приходится тянуть целиком, см. выше) кэшируются
     **В ПАМЯТИ процесса** (`memoCache` в `giftstat.ts`, TTL 6ч, с де-дупликацией параллельных запросов и
     stale-on-error), **НЕ через `gsCache`/Postgres** — запись/чтение такого блоба (~1-2МБ JSON) ОДНОЙ строкой
     через Neon HTTP-драйвер (инв.1) на практике оказалась медленной и ненадёжной (`prisma:error fetch
     failed`, дропдаун «Модель» грузился ~5 минут на холодном кэше вместо ~1-2с — ловили на реальном прогоне
     сразу после первого варианта миграции на Giftstat, не гипотетически). Раз процесс — единственный
     долгоживущий локальный (инв.1, не serverless) — module-level `Map` корректна и НЕ теряется между
     запросами в рамках одного `npm run dev`/прод-процесса; при рестарте — просто холодный кэш, не критично.
     **Если добавляешь новый ГЛОБАЛЬНЫЙ (не per-collection) список из Giftstat — кэшируй его так же `memoCache`,
     не `cachedGs`.**
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
   (поллинг) — GET `/api/prices`. Запуск воркера абстрагирован в `src/lib/trigger.ts`: всегда `spawn`
   локального detached-процесса (`tsx worker/*.ts`) — не блокирует HTTP-запрос. Джоба стартует только
   по сигналу. Cooldown/running-guard живут в `/api/prices`. **`PriceRun{running}` создаётся синхронно
   в роуте ДО спавна** (не в воркере) и его `runId` прокидывается воркеру (`--run-id=`) — иначе два
   быстрых POST спавнили два прогона (TOCTOU). Осиротевшую `running`-строку (воркер упал) роут считает
   мёртвой через `STALE_RUNNING_MS` (10 мин), чтобы кнопка не залипала. Legacy-скан — тем же путём
   (`job=scan`, `/api/scan`).
   - **Живой прогресс прогона (прогресс-бар + консоль-лог).** Прогоны «Получить цены»/«Получить объём»
     тяжёлые (десятки секунд–минуты) → без обратной связи кажутся зависшими. Прогресс хранится в строке
     `Setting{key:"progress:prices"|"progress:volume"}` (`src/lib/progress.ts`) — **НЕ в новой колонке**
     (чтобы не гонять offline-миграцию, инв. 1). Воркер пишет `{runId,done,total,label,phase}` throttled'ом
     (`createProgress`, деф. 500мс; смена фазы/итог — сразу, покадровые инкременты — по таймеру), в конце
     `clearRunProgress`. GET-статус (`/api/{prices,volume}`) отдаёт `progress` **только для текущего живого
     прогона** (гейт `progress.runId === running.id` — не показать хвост прошлого). Клиент — общий хук
     `useRunPoller` (`src/components/useRunPoller.ts`): поллит статус (1.2с), копит консоль-лог из `label`
     (последние 7 строк), **`router.refresh()` только ПРИ ЗАВЕРШЕНИИ** (не на каждый тик — данные витрины/
     таблицы появляются лишь в конце; это же позволило ускорить поллинг). Рендер — `RunProgress.tsx`
     (бар + проценты + затухающий mask'ом лог, курсор-мигалка; `total=0` → индетерминантный бар). Прогресс —
     **вспомогательный: сбой его записи НИКОГДА не роняет прогон** (best-effort try/catch в `progress.ts`).
     Для объёма per-collection прогресс **стримит Python-сайдкар** (см. инв. 9, протокол `@P`).

5. **Прогон цен → снапшот в БД, витрина читает последний прогон.** `worker/prices.ts`: для каждого
   **пресета × 5 маркетов × каждого фона** (отдельный `/search` на фон — секция гарантированно показывает
   свои лоты без обрезки лимитом 50; маркеты параллельно, per-market лимитер) тянет лоты, считает
   `priceStars/priceUsd/floorTon/floorDeviationPct`, пишет `MarketListing` под `runId`; статус/деградацию —
   в `PriceRun` (`marketStatus[presetId][market] = ok|failed` — degraded per-столбец/модель, НЕ по коллекции).
   Старые снапшоты чистятся (остаётся последний run). Витрина (`src/app/page.tsx`) читает последний `PriceRun`
   + его `MarketListing`, группирует `presetId → backdropName` (`ColumnData.sections`, тип `BackdropSection[]`
   в `PresetColumn.tsx`) и отдаёт сериализуемые `columns` клиентскому `Showcase`. **Эта группировка по фону —
   ТОЛЬКО форма серверных данных**, дальше по пути она разворачивается в плоский список (см. ниже) — сам
   `PresetColumn` секции по фону больше НЕ рендерит.
   - **Панель «Фильтр» (`src/components/Showcase.tsx`) — ГЛОБАЛЬНАЯ, чисто клиентская.** Одна кнопка-тулбар
     над сеткой (только когда есть пресеты) с поповером: (a) сортировка лотов по цене возр./убыв. и (b) 5
     чекбоксов площадок вкл/выкл. `derived` (`useMemo`) для каждой колонки делает `sections.flatMap(s =>
     s.lots)` → ОДИН плоский список лотов на колонку → фильтрует по площадкам → сортирует по цене ЦЕЛИКОМ,
     БЕЗ учёта фона — **сортировка не сбрасывается на каждом новом фоне** (было именно так до этого — юзер
     репортнул как баг: «сначала дешёвые лоты одного фона, потом опять с дешёвых — новый фон»; фикс —
     убрали секции по фону из рендера совсем, фон каждого лота теперь бейдж с цветной точкой на самой
     `LotCard` — `lot.backdropName`, colour из той же `backdropColor()`). Всё — **без запросов/API/БД**
     (фильтр/сортировка — это только преобразование вида, данные не перезапрашиваются). Выбор помнится в
     `localStorage` (`pluton:showcase-filter:v1`, гидрация в `useEffect` после монтирования → нет
     SSR-mismatch; дефолт = все площадки, цена по возр.). Колонка, опустевшая ИЗ-ЗА фильтра, показывает «Нет
     активных лотов» на весь столбец (НЕ по секциям — секций в рендере больше нет; колонки НЕ прячем —
     стабильный layout). **Выбор направления сортировки закрывает поповер** (иначе на коротком столбце
     панель перекрывает результат и кажется, что не применилось); чекбоксы площадок (мультивыбор) — не
     закрывают. Degraded-колонки фильтр не затрагивает (`degraded` пробрасывается нетронутым, `lots` для
     них не считается).

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

9. **Вкладка «Объёмы» = реальный объём/продажи ТОЛЬКО из Portals (authed), НЕ из gift-satellite/Giftstat.**
   Эмпирически (probe): ни gift-satellite, ни keyless-Giftstat (`api.giftstat.app`) НЕ отдают объём торгов,
   вторичные продажи, время последней сделки и счётчик продаж по моделям (`/volume`,`/sales`,`/activity` →
   404; `last_sale_date` Giftstat = дата ПЕРВИЧНОГО минта; `model_count` = тираж, не продажи). Реальный
   объём есть только у Portals (`portal-market.com/api`), за Cloudflare + истекающим Telegram-`tma`.
   - **Изоляция грязи в Python-сайдкаре** `worker/portals_fetch.py` (portalsmp: curl_cffi обход Cloudflare +
     Pyrogram минт tma из headless session-строки `TELEGRAM_SESSION`). Node-воркер `worker/volume.ts` его
     **спавнит** (как tsx-джобы) и читает JSON; вся работа с БД — в Node. Сайдкар минтит tma ОДИН раз на
     процесс (режим `--run` обходит все коллекции внутри одного процесса; per-collection spawn плодил бы
     100+ Telegram-коннектов). `src/lib/portals.ts` — мост Node→сайдкар + защитный парсинг (схема Portals
     из dev-среды не проб'илась → поля коллекций/продаж парсим по кандидатам ключей, как giftSatellite;
     первый реальный прогон логирует `sample` — при расхождении поправить кандидаты).
   - **Живой прогресс `--run` — протокол `@P` по stderr.** Сайдкар печатает `stdout` = финальный JSON
     результата, но per-collection прогресс шлёт **строками stderr с префиксом `@P {json}`** (`emit_progress`
     в `portals_fetch.py`, по одной на коллекцию). `runPortalsSidecar` построчно парсит stderr: `@P`-строки
     → `onProgress` (буферизует незавершённую строку между чанками), остальной stderr копит для текста ошибки.
     `fetchPortalsRun(period,limit,onProgress)` пробрасывает колбэк в `worker/volume.ts` → прогресс-бар «Сбор
     объёма по коллекциям» (инв. 4). **Не смешивать `@P` со stdout** — иначе `JSON.parse(out)` результата сломается.
   - **⚠ ХОСТ Portals: `portal-market.com` (СИНГУЛЯРНЫЙ «portal»), НЕ `portals-market.com`.** Площадка
     мигрировала домен **2026-07-16**: у старого `portals-market.com` сняли DNS-запись (curl: (6) Could not
     resolve host), из-за чего «Получить объём» падал — **это была НЕ Telegram-сессия, а DNS**. `portalsmp`
     1.2 (последняя на PyPI) всё ещё хардкодит СТАРЫЙ хост в `API_URL`/`Origin`/`Referer` — апгрейд пакета не
     спасает. **Фикс — монкипатч** `_patch_host()` в `worker/portals_fetch.py` (переставляет модульные глобалы
     `portalsmp.portalsapi` на живой хост; функции либы читают их на каждом вызове, так что патч действует на
     все запросы). База настраивается env-переменной **`PORTALS_API_BASE`** (деф. `https://portal-market.com`)
     на случай новой миграции. **Авторитетный источник актуального хоста — `web_view.url` мини-аппа бота
     `@portals` в Telegram** (Telegram хранит зарегистрированный URL мини-аппа; минт WebView → в URL live-домен;
     `portals.market`/`portalsmarket.com` — чужие припаркованные Sedo `91.195.240.*`, НЕ подставлять).
   - **Health-check обязателен и громкий** (`assertPortalsAuth` в `src/lib/portals.ts`): роняет прогон ДО
     обхода коллекций и печатает жирный баннер. Зовётся: первый шаг `worker/volume.ts`, `npm run portals:health`.
     **Различает причину провала** (было: любой сбой = «PORTALS AUTH DEAD», гнало перелогиниваться впустую):
     сайдкар классифицирует исключение (`_classify` в `portals_fetch.py`) и помечает `die`-сообщение префиксом
     `PORTALS_NETWORK_ERROR` (DNS/таймаут/curl (6)/(7)/Cloudflare) / `PORTALS_AUTH_ERROR` (протухший tma:
     401/403/`AUTH_KEY_UNREGISTERED`/…) / `PORTALS_UNKNOWN_ERROR`. `assertPortalsAuth` по префиксу показывает
     РАЗНЫЕ терминал-баннеры и бросает разные коды: `portals_network_down:` (сеть — сессия ни при чём) /
     `portals_auth_dead:` (чинить сессию) / `portals_error:` (общий). UI `/volumes` по `lastRun.error`
     (`netDown` = `/portals_network_down|PORTALS_NETWORK_ERROR/`) показывает нейтральный «Portals недоступен по
     сети» ОТДЕЛЬНО от amber «сессия протухла» (`authDead = failed && !netDown && authOk===false`).
   - **Контур — как «Получить цены»** (инв. 4/5): кнопка «Получить объём» + дропдаун периода (24h/7d/30d,
     выбор ДО запуска) → `POST /api/volume?period=` создаёт `VolumeRun{running,period}` СИНХРОННО (TOCTOU) →
     `triggerWorker("volume", runId, period)` → снапшот в `CollectionVolume` → read-only `/volumes` читает
     последний прогон периода (сорт по объёму убыв.). Cooldown `settings.volume.cooldown_minutes` (деф. 15),
     per-period; running-guard `freshVolumeRun` (STALE 20 мин). Старые прогоны периода чистятся.
   - **`isPartial` — про полноту ОБЪЁМА, per-collection** (не общий текст): 24h объём = нативный daily
     volume Portals (полон → `isPartial=false`); 7d/30d = сумма продаж из sales-feed за окно, `isPartial =
     capped || budgetSkipped` (пагинация уперлась в per-collection кап ИЛИ до коллекции не дошёл общий бюджет
     времени прогона `PORTALS_RUN_BUDGET_SEC`). В таблице у таких строк — бейдж `TriangleAlert` с тултипом
     рядом с ячейкой объёма.
   - **Цены/floor/объём в TON всегда с `$`** (инв. 3): `LotPrice` со `stars=null`. Картинки коллекций —
     `changesOriginalImageUrl` по telegramId (keyless, инв. 2); telegramId И `blockchain_address` (ссылка
     на Getgems) — из ОДНОГО вызова `giftstatCollections()` (`src/lib/giftstat.ts`, инв. 2; раньше был
     gift-satellite-first + Giftstat-фолбэк, теперь единственный источник, keyless). Ссылки на маркеты —
     `src/lib/marketLinks.ts` (надёжен per-collection только Getgems по адресу; Portals/Fragment — вход
     в маркет).
   - **Секреты Telegram — из БД, не из env** (см. инв. 10): `runPortalsSidecar()` в `src/lib/portals.ts`
     читает `TELEGRAM_API_ID`/`TELEGRAM_API_HASH`/`TELEGRAM_SESSION` через `getTelegramCreds()` и
     подмешивает их в `env` при спавне `portals_fetch.py` (сам сайдкар не меняется). Локально нужен
     установленный Python 3 (`pip install -r requirements.txt`) — Node просто спавнит его напрямую,
     отдельного деплоя/сервера не требуется. **`TELEGRAM_SESSION` получают кнопкой «Получить» в UI**
     (мастер вместо консоли — инв. 12).

10. **API-ключи хранятся зашифрованными в БД, НЕ в `.env`.** Проект шарится как папка с кодом — секреты в
    файлах утекли бы вместе с ней. `src/lib/secrets.ts`: одна строка `Setting{key:"secrets"}`, каждое из
    5 полей (`giftSatelliteKey`/`tonapiKey`/`telegramApiId`/`telegramApiHash`/`telegramSession`) — свой
    AES-256-GCM конверт (свой IV, можно менять/чистить поле не трогая остальные). Ключ шифрования —
    `SETTINGS_ENCRYPTION_KEY` (env, `openssl rand -hex 32`, живёт в локальном `.env`) — им
    шифруются/расшифровываются секреты в БД. In-memory TTL-кэш 60с поверх ещё-зашифрованного
    значения (прогон воркера дёргает `getGiftSatelliteKey()` на каждый HTTP-вызов — без кэша сотни лишних
    round-trip'ов в Neon); `setSecrets()` инвалидирует кэш сразу.
    - **Ввод — экран `/settings`** (`src/app/settings/page.tsx` + `SettingsForm.tsx` + `api/settings/route.ts`).
      `GET` отдаёт только booleans (задано/нет) — плейнтекст секретов клиенту не возвращается никогда;
      пустое поле при сабмите = «не менять», явная кнопка «очистить» = удалить. После сохранения
      `giftSatelliteKey` сразу вызывается `GiftSatellite.getCollections()` как дешёвая проверка ключа —
      баннер-подсказка в ответе, сохранение не блокирует.
    - **Гейт — только `GIFT_SATELLITE_KEY`** (`src/lib/requireConfigured.ts`, framework-aware `redirect()`,
      поэтому НЕ в `secrets.ts`, который импортируют голые tsx-воркеры без Next-рантайма). Без него `/`,
      `/presets`, `/volumes` редиректят на `/settings?next=...`. **С инв.2 это строже, чем технически
      необходимо** — каталог/dropdown'ы/floor/валидация пресетов уже не зависят от этого ключа (Giftstat,
      keyless), нужен он только для лотов конкретной комбинации Модель+Фон (`searchMarket` в
      `worker/prices.ts`). Гейт сознательно НЕ ослаблен в рамках этой задачи — отдельная будущая задача
      онбординга должна перевернуть модель (ключ = опция, добавляющая данные, а не условие входа), а не
      забытый недосмотр. `TONAPI_KEY` опционален (free tier 1 RPS работает без него), ничего не блокирует.
      Telegram-креды **тоже не блокируют вход** — их отсутствие
      только отключает кнопку «Получить объём» (мягкий гейт: `isTelegramConfigured()` в
      `api/volume/route.ts` POST + `volumes/page.tsx`, amber-плашка со ссылкой на `/settings`), без
      редиректа. Это НЕ аутентификация приложения — гейт закрывает только «нет ключа», не «незнакомый
      посетитель»; логина/сессий в проекте нет.
    - **Client/server-граница обязательна:** `secrets.ts` использует `node:crypto` — server-only. Клиентские
      компоненты берут `Market`/`marketLabel` из `src/lib/markets.ts` напрямую, **НЕ** из `giftSatellite.ts`
      (тот теперь тянет `secrets.ts`) — иначе webpack падает на сборке (`UnhandledSchemeError: node:crypto`),
      т.к. тащит серверный модуль в client-бандл. Ловили на `LotCard.tsx` при первой сборке после этого
      рефакторинга — если появится новый клиентский импорт из `giftSatellite.ts`, чинить так же.

11. **Флаг «онбординг пройден» — отдельная персистентная запись, НЕ эвристика по ключам.**
    `Setting{key:"onboarding"}` (`src/lib/onboarding.ts`: `getOnboardingCompleted()`/`setOnboardingCompleted()`)
    отделён от гейта `GIFT_SATELLITE_KEY` (инв. 10) — можно быть «онбординг пройден» без ключа (Skip) и
    наоборот. **Бэкфилл встроен прямо в чтение**: если строки флага нет, но `isGiftSatelliteConfigured()`
    истинно — читаем как пройдено и лениво дописываем строку, без отдельного скрипта миграции (иначе апдейт
    этой фичи заставил бы уже настроенную установку увидеть Get Started заново). `getOnboardingCompleted`
    обёрнута в `cache()` из `react` — дедуплицирует чтение флага в рамках одного запроса (корневой
    `layout.tsx` + page-level `requireOnboarded()` бьют в один DB round-trip, не в два). Гейт
    `requireOnboarded()` (`requireConfigured.ts`) проверяется ПЕРЕД `requireGiftSatelliteConfigured` на `/`,
    `/presets`, `/volumes` — редиректит на `/onboarding?next=...`; `/settings` НЕ гейтится (вечная
    escape-hatch, как и раньше). `/onboarding` сам редиректит на `next`, если флаг уже стоит (гайд не
    показывается повторно).
    - **`/onboarding` = полноэкранный пошаговый мастер** (`OnboardingForm.tsx`, клиентская стейт-машина
      `step`): заставка «PluTON» + «Старт» → 5 шагов-полей (по одному: `giftSatelliteKey` ОБЯЗАТЕЛЬНО без
      Skip, «Next» disabled пока пусто/не сохранено; затем `tonapiKey`/`telegramApiId`/`telegramApiHash`/
      `telegramSession` — каждое опц. со Skip/Next) → экран «Готово»/«Финиш». Сохранение НЕ пошагово, а один
      раз на «Финиш»: `POST /api/settings` (непустые `values`) → проверка `status.giftSatelliteKey` (нет →
      назад на шаг ключа) → `POST /api/onboarding` (флаг) → `router.push(next)`. Переход между шагами —
      remount по `key={step}` + CSS-класс `.wizard-step` (keyframe `pl-step-in`, 320ms, в `globals.css` под
      `prefers-reduced-motion`); заставочный заголовок «PluTON — Get Started» из `page.tsx` УБРАН (переехал в
      шаг-заставку). `onboarding/page.tsx` — тонкая полноэкранная обёртка (`min-h-[100dvh]`).
    - **Хром приложения на `/onboarding` скрыт** — `TopNav`/`MobileNav` (`Nav.tsx`) и `Footer.tsx` делают
      `if (usePathname() === "/onboarding") return null` (`Footer` ради этого стал клиентским). БЕЗ route
      groups — layout-архитектура (`layout.tsx` с `<html>/<body>`, шрифтами, `template.tsx`, оверлеем)
      прежняя. Атрибуция @GiftChanges на онбординге не нужна (арта подарков там нет), на остальных страницах
      сохраняется. `WelcomeBackOverlay` на онбординге и так `null` (`onboarded=false`).
    - **Экран возврата** — `WelcomeBackOverlay.tsx` (не роут, `fixed`-оверлей в `layout.tsx`, НЕ оборачивает
      `{children}` структурно), показывается один раз за сессию вкладки браузера (`sessionStorage`), только
      если флаг стоит; будущий хук для фоновой подгрузки цен — маркер-комментарий внутри его `useEffect`
      (сейчас не реализован). **Фазовый таймлайн анимации** (`phase: reveal→flyby`): приветствие проявляется
      пословно (крупнее/медленнее) → по `onDone` из `WordReveal` один раз позади текста пролетает планета
      (`PlanetSphere` + `.planet-flyby`, ~2с, без деформации/взрыва) → `setVisible(false)`. Скрытие НЕ
      зависит от проигрывания анимации; при reduced-motion — статичный текст ~1.2с без пролёта.
    - **Анимации онбординга/возврата = система «Digital Serenity» + планета** (реф-механика из чужого
      лендинга, адаптирована под чёрно-белую палитру). **Жёсткое разграничение участков:** (a) **заставка
      мастера** (`step===0`) — атмосфера `SerenityBackdrop` (**только плавающие точки + рябь при клике**;
      сетка, декоративные уголки и градиент за курсором убраны по требованию) + пословный `WordReveal`
      заголовка/описания + планета **статична** в правом верхнем углу; (b) **шаги-поля 1..5 и «Готово»** —
      атмосферы НЕТ, только планета: непрерывно живёт ВНЕ `key={step}`-контейнера (`OnboardingPlanet` в корне
      формы, иначе remount сбрасывал бы деформацию), дрейфует из угла к центру + **нарастающая пульс-деформация**
      (`.planet-wobble` = blob-морф `border-radius` **+** `pl-planet-pulse` асимметричный squish; амплитуда
      `--amp` и скорость `--wobble-dur`/`--pulse-dur` РАСТУТ с каждым шагом → к финалу деформация сильная); на
      «Финиш» — **взрыв: планета РАСПАДАЕТСЯ на логотипы TON** (`TonLogo` + `.planet-fragment`, phyllotaxis-кластер
      → разлёт в разные стороны по per-fragment `--fx/--fy/--fr` + поворот; **сзади ничего не появляется** —
      никакого центрального reveal), слой взрыва поднят на `z-40` над карточкой; всё параллельно сохранению
      (оптимистично: `setExploding(true)` сразу, откат при ошибке), навигация после `Promise`-гонки `burst`/save
      (`explodeMs` 1000/350мс); (c) **welcome-back** — атмосфера + `WordReveal` + одиночный пролёт (см. выше).
      **reduced-motion — проектный allow-list:** все `@keyframes` и их классы лежат ВНУТРИ
      `@media (prefers-reduced-motion: no-preference)` в `globals.css`, а базовые (вне блока) состояния =
      финальные/видимые (`.word-animate{opacity:1}` и т.п.) — при reduce всё рисуется статично без залипания
      в `opacity:0`; JS-эффекты (градиент за курсором, рябь, тайминги взрыва/пролёта) дополнительно гейтятся
      через `usePrefersReducedMotion()` (`src/lib/usePrefersReducedMotion.ts`). **Client/server-граница:**
      компоненты серии `src/components/serenity/*` и `onboarding/OnboardingPlanet.tsx` — клиентские; палитра
      только монохром (чёрные/серые rgba, никакой slate-темы референса).
    - **Тест-команды:** `npm run onboarding:reset` бэкапит `secrets`/`onboarding` в
      `Setting{key:"_onboarding_test_backup"}` и чистит их (симуляция первого запуска — `/` редиректит на
      `/onboarding`); `npm run onboarding:restore` возвращает из бэкапа. `reset` отказывается работать, если
      бэкап уже есть (сначала `restore`). Скрипты — `scripts/onboarding-{reset,restore}.ts`.

12. **`TELEGRAM_SESSION` получается кнопкой «Получить» прямо в `/settings` — консоль не нужна.** Обычному
    пользователю недоступен терминал, поэтому `npm run portals:login` (инв. 9) переехал в UI-мастер (остаётся
    консольным фолбэком). Полностью «в один клик» сессию выдать НЕЛЬЗЯ — Telegram шлёт код подтверждения в
    приложение, его обязательно ввести вручную (+ облачный пароль при 2FA); мастер лишь переносит этот поток
    из консоли в браузер.
    - **Живой процесс входа обязателен между HTTP-запросами.** `phone_code_hash` из `send_code()` валиден
      ТОЛЬКО на том же MTProto-соединении, что и `sign_in()` — поэтому один Python-процесс
      (`worker/portals_login_interactive.py`, line-JSON протокол на stdin/stdout, `Client(in_memory=True)`)
      держится живым весь мастер, а не спавнится заново на каждый шаг (в отличие от buffered
      `runPortalsSidecar`). Реестр — module-level singleton активного логина в `src/lib/portalsLogin.ts`
      (один вход за раз, TTL-kill 5 мин; local single-user — допустимо). Server-only (`node:child_process`);
      клиент ходит туда ТОЛЬКО через роут (инв. 10).
    - **Поток:** `POST /api/settings/telegram-login` с дискриминатором `action` (`start`→`send_code`,
      `code`→`sign_in`, `password`→`check_password`, `cancel`→kill). Синхронный request/response (НЕ поллинг).
      Клиент — `TelegramLoginDialog.tsx` (стейт-машина `phone→code→password?→done`), встроен в `SettingsForm`
      и `OnboardingForm` рядом с полем «Telegram Session»; кнопка активна, когда API ID и Hash доступны
      (сохранены ИЛИ набраны в форме — тогда уйдут в БД вместе с сессией).
    - **Строка сессии НЕ возвращается клиенту** (инв. 10): на успехе роут пишет её (и API ID/Hash идемпотентно)
      сразу в зашифрованную БД через `setSecrets()`, отдаёт клиенту только `{status, user}`; поле показывает
      «✓ настроено». Пароль 2FA используется только для `check_password` (SRP) — не логируется, не хранится,
      в session-строке его нет. Ошибки сайдкара нормализуются в дружелюбные коды
      (`code_invalid`/`code_expired`/`password_invalid`/`session_expired`/…).

## Структура
- `src/app/` — 3 основных экрана: `/` (Витрина — `page.tsx`, горизонтальные колонки-пресеты), `/presets`
  (Мои пресеты), `/volumes` (Объёмы — таблица рыночной статистики из Portals, инв. 9); плюс `/settings`
  (ввод API-ключей, инв. 10) — не в основной навигации-табах, точка входа — пункт «Ключ» в fluid-меню
  профиля (`ProfileMenu`) в `TopNav`; плюс `/onboarding` (Get Started, первый запуск, инв. 11) — не в
  навигации, редирект-цель гейта `requireOnboarded()`. Единая
  навигация: общий `TopNav`/`MobileNav` из `layout.tsx` на ВСЕХ страницах (бокового `SideNav` больше нет).
  API-роуты: `api/collections/` (список + floor + курсы) + `api/attributes/` (dropdown'ы из
  Giftstat, кэш), `api/model-previews/` (арт КАЖДОЙ модели из changes.tg + индикативный floor из Giftstat),
  `api/presets/` (GET/POST — upsert по коллекция+модель, повторное добавление **сливает** наборы фонов
  union'ом, не заменяет; POST заполняет `previewImageUrl` арт'ом модели) + `api/presets/[id]/` (DELETE),
  `api/prices/` (триггер+статус), `api/volume/` (триггер+статус вкладки «Объёмы», `?period=`,
  409 `telegram_not_configured` без Telegram-кредов), `api/settings/` (GET статус/POST сохранение
  ключей, инв. 10) + `api/settings/telegram-login/` (POST `action`-мастер Telegram-входа, инв. 12),
  `api/onboarding/` (POST — выставляет флаг онбординга, инв. 11), `api/scan/`
  (legacy-триггер). Серверные страницы: `force-dynamic` **+** `unstable_noStore()`.
- **Вкладка «Объёмы» (инв. 9):** компоненты `GetVolumeButton` (кнопка+дропдаун периода, живой прогресс-бар/
  лог через `useRunPoller`+`RunProgress`, инв. 4),
  `VolumeTable` (таблица, per-row бейдж `isPartial`); либы `portals.ts` (мост к Python-сайдкару +
  health-check), `portalsLogin.ts` (реестр живого процесса UI-входа, инв. 12), `giftstat.ts` (каталог
  Giftstat, инв. 2 — здесь только для telegramId+`blockchain_address`), `marketLinks.ts`,
  `volumeRun.ts` (running-guard). Воркер
  `worker/volume.ts` + Python `worker/portals_fetch.py` (осн. сбор) / `worker/portals_login_interactive.py`
  (UI-мастер входа, инв. 12) / `worker/portals_login.py` (консольный фолбэк). Миграция таблиц —
  `scripts/migrate-volumes.ts`.
- `src/components/` — витрина: `GetPricesButton` (триггер + живой прогресс-бар/лог через общий
  `useRunPoller`, устойчив к смене вкладки; инв. 4), `RunProgress` (презентационный бар+проценты+консоль-лог),
  `useRunPoller` (хук поллинга статуса+прогресса, refresh при завершении, cooldown),
  `Showcase` (клиентская обёртка сетки: глобальная панель «Фильтр» — сортировка по цене ПЛОСКО по всей
  колонке + выбор площадок, localStorage; см. инв. 5), `PresetColumn` (столбец=модель, один список лотов,
  без секций по фону — см. инв. 5)/`LotCard` (карточка лота, в т.ч. бейдж фона — цветная точка + имя)/
  `LotPrice`/`FloorChip` (× к floor)/`GiftImage`; пресеты: `PresetForm` (каскад `CollectionSelect`→`ModelSelect`→
  `BackdropMultiSelect`; первые два — кастомные dropdown'ы с миниатюрами/мин.ценой, без панели превью),
  `PresetList` (удаление, фото модели через `GiftImage`, чипы-образцы фонов); настройки: `SettingsForm`
  (ввод/очистка API-ключей, инв. 10), `TelegramLoginDialog` (инлайн-мастер Telegram-входа телефон→код→2FA
  рядом с полем «Telegram Session», инв. 12; в `SettingsForm` и `OnboardingForm`); первый запуск (инв. 11): `OnboardingForm` (полноэкранный пошаговый
  мастер: заставка → 5 шагов-полей со Skip/Next → «Готово»/«Финиш»; интегрирует планету/атмосферу/пословный
  текст, взрыв на «Финиш»), `WelcomeBackOverlay` (fixed-оверлей возврата, sessionStorage; фазовый
  таймлайн reveal→flyby); **анимации «Digital Serenity» + планета** (инв. 11) — `serenity/SerenityBackdrop`
  (фоновая атмосфера: плавающие точки + рябь — БЕЗ сетки/уголков/градиента), `serenity/WordReveal` (пословное
  появление + `onDone`), `serenity/PlanetSphere` (монохромный шар-визуал), `serenity/TonLogo` (монохромный
  логотип TON — осколки взрыва), `onboarding/OnboardingPlanet`
  (траектория угол→центр + нарастающая пульс-деформация + распад на TON-логотипы по `step`); каркас: `Nav` (`TopNav`/`MobileNav`), `ProfileMenu` (fluid-меню
  профиля в `TopNav`: круглые кнопки без подписей, выезжают вниз, триггер морфится профиль↔крестик;
  пункты — Ключ→`/settings`, Терминал-заглушка, Поддержка→t.me), `Footer` (в т.ч. обязательная
  атрибуция @GiftChanges).
- `src/lib/` — `db.ts` (Prisma+Neon), `secrets.ts` (шифрование API-ключей в БД, инв. 10),
  `onboarding.ts` (флаг первого запуска + бэкфилл, инв. 11),
  `requireConfigured.ts` (гейты `requireOnboarded`/`requireGiftSatelliteConfigured`), `giftstat.ts`
  (ОСНОВНОЙ источник каталога/моделей/фонов/floor — keyless, Слой А, инв. 2), `giftSatellite.ts` (сужен до
  `searchMarket` — конкретные лоты Модель+Фон, платный ключ через `secrets.ts`, Слой Б, инв. 2),
  `markets.ts` (client-safe константы маркетов `Market`/`MARKETS`/`marketLabel` — без
  `process.env`/сети/`node:crypto`; `giftSatellite` их РЕ-ЭКСПОРТИРУЕТ для серверных импортов, но
  клиентские компоненты берут их **напрямую отсюда**, не из `giftSatellite.ts` — см. инв. 10 про
  client/server-границу), `gsCache.ts` (источник-агностичный TTL+stale-on-error кэш каталога),
  `changesTg.ts` (детерм. URL арта модели/коллекции из api.changes.tg по telegramId), `giftPreviews.ts`
  (резолвер `collectionName→telegramId` из кэш-каталога Giftstat + индикативный floor модели), `rates.ts`
  (курсы из settings),
  `backdropColors.ts` (палитра фонов Telegram: имя→hex, сортировка по цветовой семье→тёмный→светлый),
  `format.ts` (TON+⭐+$, `formatFloorMultiple`), `tonapi.ts` (курс + legacy-скан, ключ через `secrets.ts`),
  `scoring.ts` (только статистика/редкость), `trigger.ts` (локальный spawn воркер-джобы),
  `progress.ts` (живой прогресс прогонов в строке `Setting`, throttled `createProgress`; инв. 4),
  `portalsLogin.ts` (server-only реестр живого процесса Telegram-входа для UI-мастера, инв. 12),
  `address.ts`, `usePrefersReducedMotion.ts` (клиентский хук — JS-гейт reduced-motion для анимаций инв. 11).
- `worker/` — `prices.ts` (движок витрины), `scan.ts` (legacy), `persist.ts`, `inferSales.ts`,
  `portals_login_interactive.py` (line-JSON сайдкар UI-входа, инв. 12).
- `prisma/` — `schema.prisma` (**14 моделей** + 6 enum; новые: `Preset` (`backdropNames String[]`, unique
  по `collectionName+modelName`), `PriceRun`, `MarketListing`, `VolumeRun` (`period`, `authOk`),
  `CollectionVolume` (`volumeTon`, `isPartial`, `topModels`); `ScanStatus` переиспользован для
  `PriceRun`/`VolumeRun`), `seed.ts` (+ `settings.volume`).

## Локальный запуск
- Проект запускается **только локально**: веб (`npm run dev`) и воркер-джобы (спавнятся кнопками из UI
  через `src/lib/trigger.ts`, либо вручную `npm run worker:prices|scan|volume`) — отдельные процессы на
  своей машине, без облачного хостинга. БД — Neon (доступ по HTTP/443, см. инв. 1). Инструкция — `DEPLOY.md`.
- `SETTINGS_ENCRYPTION_KEY` (`.env`, `openssl rand -hex 32`) шифрует `GIFT_SATELLITE_KEY`/`TONAPI_KEY`/
  `TELEGRAM_*` в БД (инв. 10). Сами ключи вводятся ОДИН раз через `/settings` в приложении. Арт подарков
  (`changesTg.ts` → api.changes.tg) — **keyless**, ключа не требует; `CHANGES_TG_BASE_URL` опционально.
- **Вкладка «Объёмы» (инв. 9) — Python-сайдкар локально:** `TELEGRAM_API_ID`/`TELEGRAM_API_HASH`/
  `TELEGRAM_SESSION` — не переменные окружения, вводятся через `/settings`. `TELEGRAM_SESSION` получают
  кнопкой «Получить» прямо в `/settings` (мастер телефон→код→2FA, инв. 12); `npm run portals:login` —
  консольный фолбэк. tma истекает → health-check в начале каждого прогона объёма кричит в лог. Нужен
  установленный Python 3 (`pip install -r requirements.txt`) — в т.ч. для UI-мастера входа.
  Опц. тюнинг (env): `PORTALS_API_BASE` (деф. `https://portal-market.com` — живой хост Portals, менять при
  миграции домена, см. инв. 9), `PORTALS_RUN_BUDGET_SEC` (деф. 540), `PORTALS_MAX_PAGES`,
  `PORTALS_THROTTLE_SEC`, `PYTHON_BIN`.
