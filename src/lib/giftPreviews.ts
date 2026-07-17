import { giftstatCollections, giftstatModelFloor } from "./giftstat";
import { cachedGs } from "./gsCache";

// Превью подарков для dropdown'ов пресетов и фото сохранённых пресетов.
// Картинки (чистый арт модели / дефолтный вид коллекции) — из changes.tg по детерминированному URL
// (см. `changesTg.ts`), СЕТЬ не нужна. Здесь остаётся (а) резолвер collectionName → telegramId из
// кэшированного каталога Giftstat (join-ключ к changes.tg) и (б) индикативный floor модели из Giftstat.

const CATALOG_TTL_MS = 6 * 3600_000; // каталог коллекций — 6ч (как в /api/collections)

/** Карта имя коллекции → telegramId из кэшированного каталога Giftstat (join-ключ к changes.tg). */
export async function collectionIdMap(): Promise<Record<string, string>> {
  const { data } = await cachedGs("gs_cache:collections", CATALOG_TTL_MS, () => giftstatCollections());
  const map: Record<string, string> = {};
  for (const c of data) map[c.name] = c.telegramId;
  return map;
}

/** telegramId одной коллекции (для preset POST). null — если каталог не знает коллекцию/id. */
export async function collectionTelegramId(name: string): Promise<string | null> {
  const map = await collectionIdMap();
  return map[name] ?? null;
}

export interface ModelPreview {
  imageUrl: string | null;
  minPriceTon?: number;
}

/** Индикативная мин.цена каждой модели коллекции — тонкая обёртка над `giftstatModelFloor` (уже кэширует
 * себя внутри на 6ч, отдельного TTL здесь не нужно). */
export async function batchModelMinPrices(collection: string): Promise<Record<string, number>> {
  return giftstatModelFloor(collection);
}
