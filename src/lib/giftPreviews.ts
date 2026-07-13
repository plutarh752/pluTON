import { GiftSatellite, MARKETS } from "./giftSatellite";
import { cachedGs } from "./gsCache";

// Превью подарков для dropdown'ов пресетов и фото сохранённых пресетов.
// Картинки (чистый арт модели / дефолтный вид коллекции) — из changes.tg по детерминированному URL
// (см. `changesTg.ts`), СЕТЬ не нужна. Здесь остаётся только (а) резолвер collectionName → telegramId
// из кэшированного каталога gift-satellite и (б) индикативная мин.цена модели из `/search`.

const CATALOG_TTL_MS = 6 * 3600_000; // каталог коллекций — 6ч (как в /api/collections)
export const MODEL_PRICE_TTL_MS = 7 * 24 * 3600_000; // мин.цена модели — неделя (индикативная подсказка)

/** Карта имя коллекции → telegramId из кэшированного каталога (джойн-ключ к changes.tg). */
export async function collectionIdMap(gs: GiftSatellite): Promise<Record<string, string>> {
  const { data } = await cachedGs("gs_cache:collections", CATALOG_TTL_MS, () => gs.getCollections());
  const map: Record<string, string> = {};
  for (const c of data) if (c.telegramId) map[c.name] = c.telegramId;
  return map;
}

/** telegramId одной коллекции (для preset POST). null — если каталог не знает коллекцию/id. */
export async function collectionTelegramId(gs: GiftSatellite, name: string): Promise<string | null> {
  const map = await collectionIdMap(gs);
  return map[name] ?? null;
}

export interface ModelPreview {
  imageUrl: string | null;
  minPriceTon?: number;
}

/**
 * Индикативная мин.цена каждой модели коллекции: `/search` по 5 маркетам без фильтра модели
 * (≤50 лотов на маркет), мерж → карта modelName → минимальная цена. Покрывает модели, попавшие в
 * cheapest-50 хотя бы одного маркета; остальные вернутся без цены (картинку им всё равно даёт changes.tg).
 */
export async function batchModelMinPrices(
  gs: GiftSatellite,
  collection: string
): Promise<Record<string, number>> {
  const settled = await Promise.allSettled(MARKETS.map((m) => gs.searchMarket(m, collection)));
  const out: Record<string, number> = {};
  for (const res of settled) {
    if (res.status !== "fulfilled") continue;
    for (const lot of res.value) {
      const model = lot.modelName;
      if (!model || typeof lot.normalizedPrice !== "number") continue;
      if (out[model] == null || lot.normalizedPrice < out[model]) out[model] = lot.normalizedPrice;
    }
  }
  return out;
}
