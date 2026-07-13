// Клиент gift-satellite.dev — ОСНОВНОЙ источник PluTON v2 (мультимаркетные листинги подарков).
// Auth: заголовок `Authorization: Token <GIFT_SATELLITE_KEY>` (НЕ Bearer — см. доку API).
// Per-endpoint троттлинг под реальные лимиты: markets 2/s, tg 1/1.5s, collection-offers 1/s, gift 4/s.
// Защитный парсинг (поля неофициального API могут отсутствовать) + ретрай с бэкоффом на 429.
// Ошибки бросаются наверх — воркер ловит их НА УРОВНЕ (коллекция, маркет), а не роняет весь прогон.

// Хост API в доке не указан (только пути). Рабочий базовый URL подтверждён probe'ом (шаг 0):
// gift-satellite.dev/api (api.gift-satellite.dev НЕ резолвится). Переопределяется через env.
const BASE = (process.env.GIFT_SATELLITE_BASE_URL ?? "https://gift-satellite.dev/api").replace(/\/$/, "");
const KEY = process.env.GIFT_SATELLITE_KEY ?? "";

export type Market = "tg" | "portals" | "tonnel" | "mrkt" | "getgems";
export const MARKETS: Market[] = ["tg", "portals", "tonnel", "mrkt", "getgems"];

// Лимиты (мс между запросами на КЛЮЧ лимитера). Ключ = маркет для /search, иначе имя эндпоинта.
const INTERVALS: Record<string, number> = {
  tg: 1550, // 1 req / 1.5s (+запас)
  portals: 550, // 2 req/s
  tonnel: 550,
  mrkt: 550,
  getgems: 550,
  "collection-offers": 1050, // 1 req/s
  gift: 300, // 4 req/s (каталожные /gift/*)
};
const DEFAULT_INTERVAL = 550;
const MAX_RETRIES = 3;
// Таймаут одного HTTP-запроса. Без него зависшее соединение вешало ВЕСЬ прогон навсегда: воркер ждёт
// Promise.allSettled, который никогда не резолвится → PriceRun{running} не закрывается (ловили zombie-воркер).
// По таймауту fetch аборится → бросает → ретрай/отказ → задача маркета падает, прогон завершается degraded.
const REQUEST_TIMEOUT_MS = 20_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GiftSatelliteError extends Error {
  constructor(public status: number, public path: string, body: string) {
    super(`gift-satellite ${status} on ${path}: ${body.slice(0, 200)}`);
    this.name = "GiftSatelliteError";
  }
}

// Сериализующий per-key лимитер: параллельные вызовы одного ключа встают в очередь и держат интервал.
class RateLimiter {
  private tail = new Map<string, Promise<void>>();
  async schedule<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const interval = INTERVALS[key] ?? DEFAULT_INTERVAL;
    const prev = this.tail.get(key) ?? Promise.resolve();
    let done!: () => void;
    const mine = new Promise<void>((r) => (done = r));
    this.tail.set(key, prev.then(() => mine));
    await prev;
    try {
      return await fn();
    } finally {
      // Держим интервал ПОСЛЕ запроса перед тем как отпустить следующего в очереди.
      setTimeout(done, interval);
    }
  }
}

export class GiftSatellite {
  private limiter = new RateLimiter();

  private async request<T>(path: string, limiterKey: string, init?: RequestInit): Promise<T> {
    return this.limiter.schedule(limiterKey, async () => {
      let lastErr: unknown;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const headers: Record<string, string> = { Accept: "application/json", ...(init?.headers as Record<string, string>) };
        if (KEY) headers.Authorization = `Token ${KEY}`;
        let res: Response;
        try {
          res = await fetch(`${BASE}${path}`, { ...init, headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        } catch (e) {
          lastErr = e;
          if (attempt < MAX_RETRIES) {
            await sleep(400 * (attempt + 1));
            continue;
          }
          throw e;
        }
        if (res.status === 429 && attempt < MAX_RETRIES) {
          const ra = Number(res.headers.get("retry-after"));
          await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1000 * (attempt + 1));
          continue;
        }
        if (!res.ok) throw new GiftSatelliteError(res.status, path, await res.text());
        return (await res.json()) as T;
      }
      throw lastErr instanceof Error ? lastErr : new Error(`gift-satellite request failed: ${path}`);
    });
  }

  /** Каталог коллекций (dropdown «Коллекция»). */
  async getCollections(): Promise<GsCollection[]> {
    const d = await this.request<unknown>(`/gift/collections`, "gift");
    return Array.isArray(d) ? (d as GsCollection[]).filter((c) => c && typeof c.name === "string") : [];
  }

  /** Модели/фоны коллекции (dropdowns «Модель»/«Фон»). Имена совпадают с фильтрами /search. */
  async getCollectionAttributes(name: string): Promise<{ models: GsAttr[]; backdrops: GsAttr[] }> {
    const d = await this.request<GsCollectionDetail>(`/gift/collection/${encodeURIComponent(name)}`, "gift");
    // Дедуп по имени: источник иногда отдаёт одно имя дважды (ловили дубль модели «Rave») → React-ключи в
    // dropdown'ах перестают быть уникальными. Оставляем первое вхождение (имена — ключ фильтра /search).
    const clean = (a?: GsAttr[]) => {
      if (!Array.isArray(a)) return [];
      const seen = new Set<string>();
      const out: GsAttr[] = [];
      for (const x of a) {
        if (!x || typeof x.name !== "string" || seen.has(x.name)) continue;
        seen.add(x.name);
        out.push(x);
      }
      return out;
    };
    return { models: clean(d?.models), backdrops: clean(d?.backdrops) };
  }

  /** Листинги комбинации на одном маркете (≤50, сорт по цене возр.). Пустой массив = нет лотов. */
  async searchMarket(
    market: Market,
    collection: string,
    filters: { models?: string[]; backdrops?: string[]; symbols?: string[] } = {}
  ): Promise<GsListing[]> {
    const qs = new URLSearchParams();
    if (filters.models?.length) qs.set("models", filters.models.join(","));
    if (filters.backdrops?.length) qs.set("backdrops", filters.backdrops.join(","));
    if (filters.symbols?.length) qs.set("symbols", filters.symbols.join(","));
    const q = qs.toString();
    const path = `/search/${market}/${encodeURIComponent(collection)}${q ? `?${q}` : ""}`;
    const d = await this.request<unknown>(path, market);
    if (!Array.isArray(d)) return [];
    return (d as GsListing[]).filter((l) => l && typeof l.normalizedPrice === "number" && l.normalizedPrice > 0);
  }

  /** Последний оффер по каждой коллекции с разбивкой по маркетам (для floor коллекции). */
  async getCollectionOffers(): Promise<GsCollectionOffers[]> {
    const d = await this.request<unknown>(`/history/collection-offers`, "collection-offers");
    return Array.isArray(d) ? (d as GsCollectionOffers[]) : [];
  }
}

// ───────────────────────────── типы ответов ─────────────────────────────

export interface GsCollection {
  name: string;
  telegramId?: string;
}
export interface GsAttr {
  name: string;
  rarityPermille?: number;
}
export interface GsCollectionDetail {
  name: string;
  backdrops?: GsAttr[];
  models?: GsAttr[];
  patterns?: GsAttr[];
}
export interface GsListing {
  slug: string;
  giftId?: string;
  market: string;
  collectionName?: string;
  modelName?: string;
  backdropName?: string;
  symbolName?: string;
  normalizedPrice: number; // TON
  originalPrice?: string;
  currency?: string;
  link?: string;
  isCraftable?: boolean;
}
export interface GsOffer {
  price: number;
  timestamp?: string;
  externalId?: string;
}
// collectionName + произвольные ключи-маркеты со значением GsOffer.
export type GsCollectionOffers = { collectionName: string } & Record<string, GsOffer | string | undefined>;

// ───────────────────────────── утилиты ─────────────────────────────

/** Числовой номер подарка из slug: "PlushPepe-274" → 274. null, если не распарсили. */
export function parseNumberFromSlug(slug: string | null | undefined): number | null {
  if (!slug) return null;
  const m = slug.match(/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

// Картинка подарка по slug. В листингах gift-satellite URL картинки НЕТ — выводим из slug по CDN Fragment.
// ПАТТЕРН УТОЧНИТЬ probe-шагом; при 404 UI показывает плейсхолдер-плитку (graceful).
export function giftImageUrl(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return `https://nft.fragment.com/gift/${slug.toLowerCase()}.medium.jpg`;
}

const MARKET_LABELS: Record<string, string> = {
  tg: "Telegram",
  telegram: "Telegram",
  portals: "Portals",
  tonnel: "Tonnel",
  mrkt: "MRKT",
  getgems: "Getgems",
};

/** Человекочитаемый ярлык маркета по коду. */
export function marketLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return MARKET_LABELS[code.toLowerCase()] ?? code;
}

/** Floor коллекции = минимальная цена оффера по всем маркетам в объекте collection-offers. */
export function collectionFloorFromOffers(offers: GsCollectionOffers): number | null {
  let min: number | null = null;
  for (const [k, v] of Object.entries(offers)) {
    if (k === "collectionName" || !v || typeof v === "string") continue;
    const price = (v as GsOffer).price;
    if (typeof price === "number" && price > 0 && (min == null || price < min)) min = price;
  }
  return min;
}
