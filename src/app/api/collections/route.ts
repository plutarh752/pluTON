import { NextResponse } from "next/server";
import { GiftSatellite, collectionFloorFromOffers, type GsCollectionOffers } from "@/lib/giftSatellite";
import { cachedGs } from "@/lib/gsCache";
import { getRates } from "@/lib/rates";

// Каталог коллекций gift-satellite для dropdown «Коллекция» (кэш 6ч, stale-on-error).
// Плюс floor каждой коллекции (одним запросом /history/collection-offers, уже кэш) + курсы — чтобы
// dropdown сразу показывал «мин.цену» коллекции с ⭐/$ без доп. запросов на опцию.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const gs = new GiftSatellite();
    const { data, stale } = await cachedGs("gs_cache:collections", 6 * 3600_000, () => gs.getCollections());

    // floor по коллекциям — best-effort (не критично для списка).
    const floors: Record<string, number> = {};
    try {
      const { data: offers } = await cachedGs<GsCollectionOffers[]>(
        "gs_cache:offers",
        10 * 60_000,
        () => gs.getCollectionOffers()
      );
      for (const o of offers) {
        const f = collectionFloorFromOffers(o);
        if (f != null) floors[o.collectionName] = f;
      }
    } catch {
      // floor'ы недоступны — покажем список без цен.
    }

    return NextResponse.json({ collections: data, floors, rates: await getRates(), stale });
  } catch {
    return NextResponse.json({ collections: [], floors: {}, error: "unavailable" }, { status: 503 });
  }
}
