import { NextResponse } from "next/server";
import { giftstatModelsAndBackdrops } from "@/lib/giftstat";
import { cachedGs } from "@/lib/gsCache";
import { batchModelMinPrices, collectionTelegramId, type ModelPreview } from "@/lib/giftPreviews";
import { changesModelImageUrl } from "@/lib/changesTg";
import { getRates } from "@/lib/rates";

// Превью моделей для кастомного dropdown «Модель»: карта modelName → {картинка, мин.цена}.
// Картинка — ЧИСТЫЙ арт модели из changes.tg (детерминированный URL по telegramId+имя модели) для КАЖДОЙ
// модели каталога (в т.ч. без листингов). Мин.цена — индикативный floor модели из Giftstat (кэш 6ч внутри
// `giftstatModelFloor`, отдельного TTL здесь не нужно).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const collection = new URL(req.url).searchParams.get("collection")?.trim();
  if (!collection) return NextResponse.json({ error: "collection_required" }, { status: 400 });
  try {
    const [telegramId, attrs, minPrices, rates] = await Promise.all([
      collectionTelegramId(collection),
      cachedGs(`gs_cache:attrs:${collection}`, 6 * 3600_000, () => giftstatModelsAndBackdrops(collection)),
      batchModelMinPrices(collection),
      getRates(),
    ]);

    const previews: Record<string, ModelPreview> = {};
    for (const m of attrs.data.models) {
      previews[m.name] = {
        imageUrl: changesModelImageUrl(telegramId, m.name),
        minPriceTon: minPrices[m.name],
      };
    }
    return NextResponse.json({ previews, rates, stale: attrs.stale });
  } catch {
    return NextResponse.json({ previews: {}, error: "unavailable" }, { status: 503 });
  }
}
