import { NextResponse } from "next/server";
import { GiftSatellite } from "@/lib/giftSatellite";
import { cachedGs } from "@/lib/gsCache";

// Каталог коллекций gift-satellite для dropdown «Коллекция» (кэш 6ч, stale-on-error).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const gs = new GiftSatellite();
    const { data, stale } = await cachedGs("gs_cache:collections", 6 * 3600_000, () => gs.getCollections());
    return NextResponse.json({ collections: data, stale });
  } catch {
    return NextResponse.json({ collections: [], error: "unavailable" }, { status: 503 });
  }
}
