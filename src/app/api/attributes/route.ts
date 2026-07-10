import { NextResponse } from "next/server";
import { GiftSatellite } from "@/lib/giftSatellite";
import { cachedGs } from "@/lib/gsCache";

// Модели/фоны коллекции для dropdown'ов «Модель»/«Фон» (кэш 6ч, stale-on-error).
// Имена совпадают с фильтрами /search (один источник) — критично для матчинга.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("collection");
  if (!name) return NextResponse.json({ error: "collection_required" }, { status: 400 });
  try {
    const gs = new GiftSatellite();
    const { data, stale } = await cachedGs(`gs_cache:attrs:${name}`, 6 * 3600_000, () =>
      gs.getCollectionAttributes(name)
    );
    return NextResponse.json({ ...data, stale });
  } catch {
    return NextResponse.json({ models: [], backdrops: [], error: "unavailable" }, { status: 503 });
  }
}
