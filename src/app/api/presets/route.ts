import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { GiftSatellite } from "@/lib/giftSatellite";
import { cachedGs } from "@/lib/gsCache";
import { collectionTelegramId } from "@/lib/giftPreviews";
import { changesModelImageUrl } from "@/lib/changesTg";

// Пресеты (единый глобальный список, без логина — MVP). CRUD: список + создание/обновление.
// Пресет уникален по (collectionName, modelName); backdropNames — массив выбранных фонов (секции столбца).
export const dynamic = "force-dynamic";

export async function GET() {
  const presets = await prisma.preset.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return NextResponse.json({ presets });
}

export async function POST(req: Request) {
  let body: { collectionName?: string; modelName?: string; backdropNames?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const collectionName = body.collectionName?.trim();
  const modelName = body.modelName?.trim();
  // нормализуем фоны: массив непустых уникальных строк
  const backdropNames = Array.isArray(body.backdropNames)
    ? Array.from(new Set(body.backdropNames.map((b) => String(b).trim()).filter(Boolean)))
    : [];
  if (!collectionName || !modelName || backdropNames.length === 0) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const gs = new GiftSatellite();

  // Валидация против атрибутов коллекции (если источник доступен; иначе создаём без валидации — graceful).
  try {
    const { data } = await cachedGs(`gs_cache:attrs:${collectionName}`, 6 * 3600_000, () =>
      gs.getCollectionAttributes(collectionName)
    );
    const hasModel = data.models.some((m) => m.name === modelName);
    const validBackdrops = new Set(data.backdrops.map((b) => b.name));
    const badBackdrops = backdropNames.filter((b) => !validBackdrops.has(b));
    if (!hasModel || badBackdrops.length > 0) {
      return NextResponse.json(
        { error: "invalid_combination", hasModel, badBackdrops },
        { status: 400 }
      );
    }
  } catch {
    // источник атрибутов недоступен — не блокируем создание.
  }

  // Картинка = чистый арт модели из changes.tg (детерминированный URL по telegramId коллекции). Best-effort;
  // страницы всё равно пересчитывают её на рендере, так что промах здесь не критичен.
  let previewImageUrl: string | null = null;
  try {
    previewImageUrl = changesModelImageUrl(await collectionTelegramId(gs, collectionName), modelName);
  } catch {
    // каталог недоступен — оставим плейсхолдер.
  }

  // Upsert по (collectionName, modelName): повторное добавление той же модели СЛИВАЕТ наборы фонов
  // (union), а не заменяет — иначе второе «Добавить» стирало ранее выбранные фоны. Порядок стабильный:
  // прежние фоны в их порядке, затем новые уникальные (точечное удаление фона — отдельная функция).
  const existing = await prisma.preset.findUnique({
    where: { collectionName_modelName: { collectionName, modelName } },
  });
  if (existing) {
    const merged = Array.from(new Set([...existing.backdropNames, ...backdropNames]));
    const preset = await prisma.preset.update({
      where: { id: existing.id },
      // картинку дозаполняем, только если её ещё не было (не затираем ранее сохранённую).
      data: { backdropNames: merged, ...(existing.previewImageUrl ? {} : { previewImageUrl }) },
    });
    return NextResponse.json({ preset, updated: true }, { status: 200 });
  }

  const max = await prisma.preset.aggregate({ _max: { sortOrder: true } });
  const preset = await prisma.preset.create({
    data: { collectionName, modelName, backdropNames, previewImageUrl, sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });
  return NextResponse.json({ preset }, { status: 201 });
}
