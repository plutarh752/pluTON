import { NextResponse } from "next/server";
import { GiftSatellite } from "@/lib/giftSatellite";
import { cachedGs } from "@/lib/gsCache";
import {
  batchModelMinPrices,
  collectionTelegramId,
  MODEL_PRICE_TTL_MS,
  type ModelPreview,
} from "@/lib/giftPreviews";
import { changesModelImageUrl } from "@/lib/changesTg";
import { getRates } from "@/lib/rates";

// Превью моделей для кастомного dropdown «Модель»: карта modelName → {картинка, мин.цена}.
// Картинка — ЧИСТЫЙ арт модели из changes.tg (детерминированный URL по telegramId+имя модели) для КАЖДОЙ
// модели каталога (в т.ч. без листингов). Мин.цена — из `/search` (кэш неделя, stale-on-error, индикативно).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const collection = new URL(req.url).searchParams.get("collection")?.trim();
  if (!collection) return NextResponse.json({ error: "collection_required" }, { status: 400 });
  try {
    const gs = new GiftSatellite();
    const [telegramId, attrs, minPrices, rates] = await Promise.all([
      collectionTelegramId(gs, collection),
      cachedGs(`gs_cache:attrs:${collection}`, 6 * 3600_000, () => gs.getCollectionAttributes(collection)),
      cachedGs<Record<string, number>>(`gs_cache:modelprices:${collection}`, MODEL_PRICE_TTL_MS, () =>
        batchModelMinPrices(gs, collection)
      ),
      getRates(),
    ]);

    const previews: Record<string, ModelPreview> = {};
    for (const m of attrs.data.models) {
      previews[m.name] = {
        imageUrl: changesModelImageUrl(telegramId, m.name),
        minPriceTon: minPrices.data[m.name],
      };
    }
    return NextResponse.json({ previews, rates, stale: minPrices.stale });
  } catch {
    return NextResponse.json({ previews: {}, error: "unavailable" }, { status: 503 });
  }
}
