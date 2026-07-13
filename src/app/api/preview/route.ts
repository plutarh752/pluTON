import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  GiftSatellite,
  MARKETS,
  collectionFloorFromOffers,
  giftImageUrl,
  type GsCollectionOffers,
} from "@/lib/giftSatellite";
import { cachedGs } from "@/lib/gsCache";
import { tonToStars, tonToUsd, type Rates } from "@/lib/format";

// Превью подарка для формы пресета: картинка выбранной модели (из slug реального лота через Fragment CDN)
// + floor коллекции (TON/⭐/$). Всё кэшируется (кэш каталога + отдельный кэш превью), stale-on-error.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const collection = url.searchParams.get("collection")?.trim();
  const model = url.searchParams.get("model")?.trim();
  if (!collection) return NextResponse.json({ error: "collection_required" }, { status: 400 });

  const gs = new GiftSatellite();

  // floor коллекции из кэш collection-offers (одним запросом на все коллекции).
  let floorTon: number | null = null;
  try {
    const { data } = await cachedGs<GsCollectionOffers[]>(
      "gs_cache:offers",
      10 * 60_000,
      () => gs.getCollectionOffers()
    );
    const offers = data.find((o) => o.collectionName === collection);
    if (offers) floorTon = collectionFloorFromOffers(offers);
  } catch {
    // floor неизвестен — не критично.
  }

  // курсы из settings.rates (как в воркере) для $/⭐.
  const ratesRow = await prisma.setting.findUnique({ where: { key: "rates" } });
  const rv = (ratesRow?.value as { ton_usd?: number; stars_usd?: number } | null) ?? {};
  const rates: Rates = { ton_usd: rv.ton_usd ?? 1.78, stars_usd: rv.stars_usd ?? 0.013 };

  // картинка модели: первый лот по (collection, model) на любом маркете → slug → Fragment CDN. Кэш 6ч.
  let imageUrl: string | null = null;
  if (model) {
    try {
      const { data } = await cachedGs<string | null>(
        `gs_cache:preview:${collection}:${model}`,
        6 * 3600_000,
        async () => {
          for (const market of MARKETS) {
            try {
              const lots = await gs.searchMarket(market, collection, { models: [model] });
              if (lots.length && lots[0].slug) return giftImageUrl(lots[0].slug);
            } catch {
              // пробуем следующий маркет
            }
          }
          return null;
        }
      );
      imageUrl = data;
    } catch {
      // превью-картинка недоступна — покажем плейсхолдер.
    }
  }

  return NextResponse.json({
    imageUrl,
    floorTon,
    floorUsd: floorTon != null ? tonToUsd(floorTon, rates) : null,
    floorStars: floorTon != null && rates.stars_usd ? tonToStars(floorTon, rates) : null,
  });
}
