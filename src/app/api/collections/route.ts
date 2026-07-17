import { NextResponse } from "next/server";
import { giftstatCollections, giftstatFloorMap } from "@/lib/giftstat";
import { cachedGs } from "@/lib/gsCache";
import { getRates } from "@/lib/rates";

// Каталог коллекций Giftstat (keyless) для dropdown «Коллекция» (кэш 6ч, stale-on-error).
// Плюс floor каждой коллекции (MIN по 4 площадкам Giftstat, кэш 10 мин) + курсы — чтобы dropdown сразу
// показывал «мин.цену» коллекции с ⭐/$ без доп. запросов на опцию.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, stale } = await cachedGs("gs_cache:collections", 6 * 3600_000, () => giftstatCollections());

    // floor по коллекциям — best-effort (не критично для списка).
    const floors: Record<string, number> = {};
    try {
      const { data: floorMap } = await cachedGs<Record<string, number>>(
        "giftstat_cache:floor_map",
        10 * 60_000,
        () => giftstatFloorMap()
      );
      Object.assign(floors, floorMap);
    } catch {
      // floor'ы недоступны — покажем список без цен.
    }

    return NextResponse.json({ collections: data, floors, rates: await getRates(), stale });
  } catch {
    return NextResponse.json({ collections: [], floors: {}, error: "unavailable" }, { status: 503 });
  }
}
