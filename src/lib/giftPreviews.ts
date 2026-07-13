import { GiftSatellite, MARKETS, giftImageUrl } from "./giftSatellite";
import { cachedGs } from "./gsCache";

// Превью подарков (картинки/мин.цены) для dropdown'ов пресетов и фото сохранённых пресетов.
// Источник — тот же gift-satellite `/search` (картинки/цены есть ТОЛЬКО там, каталог их не отдаёт).
// Картинка модели физически не меняется → кэшируем на неделю; мин.цена в пикере — индикативная подсказка
// (реальные цены даёт прогон «Получить цены»).

export const PREVIEW_TTL_MS = 7 * 24 * 3600_000; // неделя

/** Картинка первого (самого дешёвого) лота по фильтрам — перебираем маркеты до первого попадания. */
export async function firstLotImageUrl(
  gs: GiftSatellite,
  collection: string,
  filters: { models?: string[] } = {}
): Promise<string | null> {
  for (const market of MARKETS) {
    try {
      const lots = await gs.searchMarket(market, collection, filters);
      if (lots.length && lots[0].slug) return giftImageUrl(lots[0].slug);
    } catch {
      // маркет упал — пробуем следующий (graceful)
    }
  }
  return null;
}

/** Картинка модели с недельным кэшем (для POST пресета / бэкфилла / превью). */
export async function cachedModelImageUrl(
  gs: GiftSatellite,
  collection: string,
  model: string
): Promise<string | null> {
  const { data } = await cachedGs(`gs_cache:preview:${collection}:${model}`, PREVIEW_TTL_MS, () =>
    firstLotImageUrl(gs, collection, { models: [model] })
  );
  return data;
}

/** Миниатюра коллекции (первый лот любой модели) с недельным кэшем. */
export async function cachedCollectionThumbUrl(gs: GiftSatellite, collection: string): Promise<string | null> {
  const { data } = await cachedGs(`gs_cache:collthumb:${collection}`, PREVIEW_TTL_MS, () =>
    firstLotImageUrl(gs, collection)
  );
  return data;
}

export interface ModelPreview {
  imageUrl: string | null;
  minPriceTon: number;
}

/**
 * Батч превью ВСЕХ моделей коллекции одним заходом: `/search` по 5 маркетам без фильтра модели
 * (≤50 лотов на маркет), мерж → карта modelName → {картинка самого дешёвого лота, минимальная цена}.
 * Покрытие — модели, попавшие в cheapest-50 хотя бы одного маркета; остальные вернутся без записи
 * (UI покажет плейсхолдер без цены).
 */
export async function batchModelPreviews(
  gs: GiftSatellite,
  collection: string
): Promise<Record<string, ModelPreview>> {
  const settled = await Promise.allSettled(MARKETS.map((m) => gs.searchMarket(m, collection)));
  const out: Record<string, ModelPreview> = {};
  for (const res of settled) {
    if (res.status !== "fulfilled") continue;
    for (const lot of res.value) {
      const model = lot.modelName;
      if (!model || typeof lot.normalizedPrice !== "number") continue;
      const prev = out[model];
      if (!prev || lot.normalizedPrice < prev.minPriceTon) {
        out[model] = { imageUrl: giftImageUrl(lot.slug), minPriceTon: lot.normalizedPrice };
      }
    }
  }
  return out;
}
