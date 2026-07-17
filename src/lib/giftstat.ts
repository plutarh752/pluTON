// Giftstat (api.giftstat.app) — keyless-агрегатор каталога подарков TON NFT.
// ОСНОВНОЙ источник Слоя А (каталог/модели/фоны/floor) — ключа не требует, доступен из коробки для любого
// клона проекта. Единственное, чего Giftstat НЕ отдаёт (подтверждено пробами реальных запросов к 4
// гипотетическим combo-путям → все 404; поля `backdrop` нет в `models/floor`) — цену конкретной комбинации
// Модель+Фон и список активных лотов. Это остаётся за gift-satellite (`giftSatellite.ts`, платный ключ,
// только `searchMarket` в `worker/prices.ts`). `id`/`str_id` коллекции у Giftstat = ТОТ ЖЕ telegramId, что
// у gift-satellite и changes.tg — join-ключ подтверждён на 17 коллекциях вразброс по каталогу, не только
// на одной.
//
// Эндпоинты каталога (`/current/collections/models|backdrops|models/floor`) НЕ фильтруются по коллекции на
// сервере (проверено — параметр молча игнорируется) → тянем полные списки (7-8 тыс. строк) ОДИН раз и
// группируем на своей стороне. Эти три глобальных списка кэшируются В ПАМЯТИ процесса (`memoCache` ниже),
// НЕ через `cachedGs`/Postgres: каждый список — это ~1-2МБ JSON, и запись/чтение такого блоба одной строкой
// через Neon HTTP-драйвер (инв.1) оказалась медленной и ненадёжной (`fetch failed`, дропдаун моделей грузился
// по 5 минут на холодном кэше — ловили на реальном прогоне). Проект — единый долгоживущий локальный процесс
// (инв.1: не serverless, без нужды в кросс-инстансовой когерентности кэша), поэтому module-level Map — не
// костыль, а правильный масштаб для этих данных. `cachedGs` (Postgres) остаётся для МЕЛКИХ per-collection
// результатов на уровне роутов (`gs_cache:attrs:*`) — те совпадают по размеру с прежним gift-satellite-кэшем.

interface MemoEntry<T> {
  at: number;
  data: T;
}
const memoStore = new Map<string, MemoEntry<unknown>>();
const memoInFlight = new Map<string, Promise<unknown>>();

/** In-memory TTL-кэш с де-дупликацией параллельных запросов (2 одновременных дропдауна на холодном кэше не
 * должны бить Giftstat дважды) и stale-on-error фолбэком на предыдущее значение. */
async function memoCache<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const entry = memoStore.get(key) as MemoEntry<T> | undefined;
  if (entry && Date.now() - entry.at < ttlMs) return entry.data;

  const pending = memoInFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const p = fetcher()
    .then((data) => {
      memoStore.set(key, { at: Date.now(), data });
      return data;
    })
    .catch((e) => {
      if (entry) return entry.data; // stale-on-error
      throw e;
    })
    .finally(() => {
      memoInFlight.delete(key);
    });
  memoInFlight.set(key, p);
  return p;
}

const BASE = (process.env.GIFTSTAT_BASE_URL ?? "https://api.giftstat.app").replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 15_000;

async function giftstatGet<T>(
  path: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T> {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`giftstat ${res.status} on ${path}`);
  return (await res.json()) as T;
}

interface GiftstatPage<T> {
  data?: T[];
}

/** Пагинация по offset — на случай если каталог перерастёт лимит одного запроса (сейчас укладывается в один). */
async function fetchAllRows<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  pageLimit = 10_000
): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  for (let i = 0; i < 10; i++) {
    const page = await giftstatGet<GiftstatPage<T>>(path, { ...params, limit: pageLimit, offset });
    const rows = Array.isArray(page.data) ? page.data : [];
    out.push(...rows);
    if (rows.length < pageLimit) break;
    offset += rows.length;
  }
  return out;
}

// ───────────────────────────── коллекции (каталог + telegramId + адрес) ─────────────────────────────

interface GiftstatCollectionRow {
  str_id?: string;
  id?: number;
  collection?: string | null;
  blockchain_address?: string;
}

export interface GiftstatCollection {
  name: string;
  telegramId: string;
  blockchainAddress?: string;
}

/** Полный каталог коллекций: имя + telegramId (join-ключ к changes.tg) + адрес блокчейна (ссылка Getgems).
 * ~21% строк каталога Giftstat не имеют имени/адреса (нессылочные "стикерные" подарки без NFT-коллекции) —
 * отфильтрованы, трекеру площадок не нужны. */
export async function giftstatCollections(): Promise<GiftstatCollection[]> {
  const rows = await fetchAllRows<GiftstatCollectionRow>("/current/collections", {});
  const out: GiftstatCollection[] = [];
  for (const r of rows) {
    if (!r.collection) continue;
    const telegramId = r.str_id ?? (r.id != null ? String(r.id) : undefined);
    if (!telegramId) continue;
    out.push({ name: r.collection, telegramId, blockchainAddress: r.blockchain_address || undefined });
  }
  return out;
}

// ───────────────────────────── модели + фоны коллекции ─────────────────────────────

interface GiftstatModelRow {
  collection?: string | null;
  model?: string;
  rarity?: number;
}
interface GiftstatBackdropRow {
  collection?: string | null;
  backdrop?: string;
  rarity?: number;
}

export interface GiftstatAttr {
  name: string;
  rarityPermille?: number;
}

async function allGiftstatModels(): Promise<GiftstatModelRow[]> {
  return memoCache("giftstat:models_all", 6 * 3600_000, () =>
    fetchAllRows<GiftstatModelRow>("/current/collections/models", {})
  );
}

async function allGiftstatBackdrops(): Promise<GiftstatBackdropRow[]> {
  return memoCache("giftstat:backdrops_all", 6 * 3600_000, () =>
    fetchAllRows<GiftstatBackdropRow>("/current/collections/backdrops", {})
  );
}

function dedupByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of items) {
    if (seen.has(x.name)) continue;
    seen.add(x.name);
    out.push(x);
  }
  return out;
}

/** Модели+фоны коллекции для dropdown'ов «Модель»/«Фон» и валидации пресетов. Один источник имён для
 * обоих — они и так совпадают между собой (внутренняя консистентность Giftstat), джойн с changes.tg —
 * по имени модели, как и раньше (официальные атрибуты Telegram у обоих источников совпадают точно). */
export async function giftstatModelsAndBackdrops(
  collectionName: string
): Promise<{ models: GiftstatAttr[]; backdrops: GiftstatAttr[] }> {
  const [models, backdrops] = await Promise.all([allGiftstatModels(), allGiftstatBackdrops()]);
  const modelAttrs = dedupByName(
    models
      .filter((m) => m.collection === collectionName && m.model)
      .map((m) => ({ name: m.model as string, rarityPermille: m.rarity }))
  );
  const backdropAttrs = dedupByName(
    backdrops
      .filter((b) => b.collection === collectionName && b.backdrop)
      .map((b) => ({ name: b.backdrop as string, rarityPermille: b.rarity }))
  );
  return { models: modelAttrs, backdrops: backdropAttrs };
}

// ───────────────────────────── floor по модели и по площадке ─────────────────────────────

interface GiftstatModelFloorRow {
  collection?: string | null;
  model?: string;
  floor_price?: number;
}

/** Индикативный floor каждой модели коллекции — серверный floor Giftstat, БЕЗ разбивки по фону/площадке
 * (блендед). Заменяет прежний `batchModelMinPrices` (дешевейший активный лот через gift-satellite,
 * требовал ключ) — семантика чуть другая, но так же честна как "индикативная цена". */
export async function giftstatModelFloor(collectionName: string): Promise<Record<string, number>> {
  const rows = await memoCache("giftstat:models_floor_all", 6 * 3600_000, () =>
    fetchAllRows<GiftstatModelFloorRow>("/current/collections/models/floor", {})
  );
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.collection !== collectionName || !r.model || typeof r.floor_price !== "number") continue;
    if (out[r.model] == null || r.floor_price < out[r.model]) out[r.model] = r.floor_price;
  }
  return out;
}

const FLOOR_MARKETS = ["portals", "tonnel", "fragment", "getgems"] as const;

interface GiftstatFloorRow {
  collection?: string;
  floor_price?: number;
}

/** MIN floor по коллекции среди 4 площадок, которые знает Giftstat (portals/tonnel/fragment/getgems).
 * ВАЖНО: набор площадок НЕ совпадает с `/search` у gift-satellite (там ещё tg и mrkt, но нет fragment) —
 * это заведомое расхождение источников, не баг (см. CLAUDE.md инв.2, по аналогии с инв.9 про объёмы).
 * Каждая площадка опрашивается независимо — падение одной не роняет остальные (graceful). */
export async function giftstatFloorMap(): Promise<Record<string, number>> {
  const perMarket = await Promise.all(
    FLOOR_MARKETS.map((m) =>
      giftstatGet<GiftstatPage<GiftstatFloorRow>>("/current/collections/floor", {
        marketplace: m,
        limit: 2000,
      })
        .then((p) => (Array.isArray(p.data) ? p.data : []))
        .catch(() => [] as GiftstatFloorRow[])
    )
  );
  const out: Record<string, number> = {};
  for (const rows of perMarket) {
    for (const r of rows) {
      if (!r.collection || typeof r.floor_price !== "number") continue;
      if (out[r.collection] == null || r.floor_price < out[r.collection]) out[r.collection] = r.floor_price;
    }
  }
  return out;
}
