import { NextResponse } from "next/server";
import { giftstatModelsAndBackdrops } from "@/lib/giftstat";
import { cachedGs } from "@/lib/gsCache";

// Модели/фоны коллекции для dropdown'ов «Модель»/«Фон» (кэш 6ч, stale-on-error). Источник — Giftstat
// (keyless); имена моделей/фонов используются и для валидации пресетов из того же источника — совпадают
// по построению.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("collection");
  if (!name) return NextResponse.json({ error: "collection_required" }, { status: 400 });
  try {
    const { data, stale } = await cachedGs(`gs_cache:attrs:${name}`, 6 * 3600_000, () =>
      giftstatModelsAndBackdrops(name)
    );
    return NextResponse.json({ ...data, stale });
  } catch {
    return NextResponse.json({ models: [], backdrops: [], error: "unavailable" }, { status: 503 });
  }
}
