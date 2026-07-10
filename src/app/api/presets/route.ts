import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { GiftSatellite } from "@/lib/giftSatellite";
import { cachedGs } from "@/lib/gsCache";

// Пресеты (единый глобальный список, без логина — MVP). CRUD: список + создание.
export const dynamic = "force-dynamic";

export async function GET() {
  const presets = await prisma.preset.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return NextResponse.json({ presets });
}

export async function POST(req: Request) {
  let body: { collectionName?: string; modelName?: string; backdropName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const collectionName = body.collectionName?.trim();
  const modelName = body.modelName?.trim();
  const backdropName = body.backdropName?.trim();
  if (!collectionName || !modelName || !backdropName) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // Валидация против атрибутов коллекции (если источник доступен; иначе создаём без валидации — graceful).
  try {
    const gs = new GiftSatellite();
    const { data } = await cachedGs(`gs_cache:attrs:${collectionName}`, 6 * 3600_000, () =>
      gs.getCollectionAttributes(collectionName)
    );
    const hasModel = data.models.some((m) => m.name === modelName);
    const hasBackdrop = data.backdrops.some((b) => b.name === backdropName);
    if (!hasModel || !hasBackdrop) {
      return NextResponse.json(
        { error: "invalid_combination", hasModel, hasBackdrop },
        { status: 400 }
      );
    }
  } catch {
    // источник атрибутов недоступен — не блокируем создание.
  }

  const max = await prisma.preset.aggregate({ _max: { sortOrder: true } });
  try {
    const preset = await prisma.preset.create({
      data: { collectionName, modelName, backdropName, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
    return NextResponse.json({ preset }, { status: 201 });
  } catch (e) {
    // уникальный конфликт (collectionName+modelName+backdropName)
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "duplicate" }, { status: 409 });
    }
    throw e;
  }
}
