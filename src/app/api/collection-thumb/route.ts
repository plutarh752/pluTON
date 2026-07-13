import { NextResponse } from "next/server";
import { GiftSatellite } from "@/lib/giftSatellite";
import { cachedCollectionThumbUrl } from "@/lib/giftPreviews";

// Ленивая миниатюра одной коллекции для кастомного dropdown «Коллекция» (запрашивается по появлению
// строки во вьюпорте через IntersectionObserver). 1 `/search`, кэш неделя, stale-on-error.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const collection = new URL(req.url).searchParams.get("collection")?.trim();
  if (!collection) return NextResponse.json({ error: "collection_required" }, { status: 400 });
  try {
    const gs = new GiftSatellite();
    const imageUrl = await cachedCollectionThumbUrl(gs, collection);
    return NextResponse.json({ imageUrl });
  } catch {
    return NextResponse.json({ imageUrl: null, error: "unavailable" }, { status: 503 });
  }
}
