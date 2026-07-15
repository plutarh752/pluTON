import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/db";
import { PresetForm } from "@/components/PresetForm";
import { PresetList } from "@/components/PresetList";
import { GiftSatellite } from "@/lib/giftSatellite";
import { collectionIdMap } from "@/lib/giftPreviews";
import { changesModelImageUrl } from "@/lib/changesTg";
import { requireGiftSatelliteConfigured, requireOnboarded } from "@/lib/requireConfigured";

// Экран «Мои пресеты»: каскадная форма + список сохранённых комбинаций.
export const dynamic = "force-dynamic";

export default async function PresetsPage() {
  noStore();
  await requireOnboarded("/presets");
  await requireGiftSatelliteConfigured("/presets");
  const presets = await prisma.preset.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });

  // Фото пресета = чистый арт модели из changes.tg, считаем НА РЕНДЕРЕ по telegramId (детерминированно) —
  // старые пресеты со stale-URL (Fragment/случайный фон) чинятся автоматически без миграции. Фолбэк на
  // сохранённое значение, если каталог недоступен (id неизвестен).
  const gs = new GiftSatellite();
  const idMap = await collectionIdMap(gs).catch(() => ({}) as Record<string, string>);

  // ACTIVE/STANDBY: есть ли по пресету лоты в последнем результативном прогоне.
  const lastRun = await prisma.priceRun.findFirst({
    where: { status: { in: ["success", "partial"] } },
    orderBy: { startedAt: "desc" },
  });
  const activeMap: Record<number, number> = {};
  if (lastRun) {
    const counts = await prisma.marketListing.groupBy({
      by: ["presetId"],
      where: { runId: lastRun.id },
      _count: { _all: true },
    });
    for (const c of counts) activeMap[c.presetId] = c._count._all;
  }

  return (
    <main className="mx-auto max-w-container px-margin-mobile py-12 md:px-margin-desktop">
      <header className="mb-12">
          <h1 className="mb-2 font-headline-lg text-headline-lg text-primary">Мои избранные комбинации</h1>
          <p className="max-w-2xl text-on-surface-variant">
            Настрой пресеты «Коллекция → Модель → Фон» для быстрого доступа к ценам по всем площадкам сразу.
          </p>
        </header>

        <section className="mb-16">
          <PresetForm />
        </section>

        <section>
          <PresetList
            presets={presets.map((p) => ({
              id: p.id,
              collectionName: p.collectionName,
              modelName: p.modelName,
              backdropNames: p.backdropNames,
              previewImageUrl: changesModelImageUrl(idMap[p.collectionName], p.modelName) ?? p.previewImageUrl,
            }))}
            activeMap={activeMap}
          />
        </section>
    </main>
  );
}
