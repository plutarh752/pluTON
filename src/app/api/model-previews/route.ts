import { NextResponse } from "next/server";
import { GiftSatellite } from "@/lib/giftSatellite";
import { cachedGs } from "@/lib/gsCache";
import { batchModelPreviews, PREVIEW_TTL_MS, type ModelPreview } from "@/lib/giftPreviews";
import { getRates } from "@/lib/rates";

// Батч превью моделей коллекции для кастомного dropdown «Модель»: карта modelName → {картинка, мин.цена}.
// Один заход = 5 троттл-запросов к /search; кэш неделя (картинка не меняется), stale-on-error. Курсы
// отдаём отдельно, чтобы клиент показал мин.цену с ⭐/$ (инвариант 3 — без голого TON).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const collection = new URL(req.url).searchParams.get("collection")?.trim();
  if (!collection) return NextResponse.json({ error: "collection_required" }, { status: 400 });
  try {
    const gs = new GiftSatellite();
    const { data, stale } = await cachedGs<Record<string, ModelPreview>>(
      `gs_cache:modelpreviews:${collection}`,
      PREVIEW_TTL_MS,
      () => batchModelPreviews(gs, collection)
    );
    const rates = await getRates();
    return NextResponse.json({ previews: data, rates, stale });
  } catch {
    return NextResponse.json({ previews: {}, error: "unavailable" }, { status: 503 });
  }
}
