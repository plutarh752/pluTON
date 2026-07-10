import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/db";
import { SideNav } from "@/components/Nav";
import { PresetForm } from "@/components/PresetForm";
import { PresetList } from "@/components/PresetList";

// Экран «Мои пресеты»: каскадная форма + список сохранённых комбинаций.
export const dynamic = "force-dynamic";

export default async function PresetsPage() {
  noStore();
  const presets = await prisma.preset.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });

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
    <div className="mx-auto flex max-w-container">
      <SideNav />
      <main className="flex-1 px-margin-mobile py-12 md:px-margin-desktop">
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
              backdropName: p.backdropName,
              previewImageUrl: p.previewImageUrl,
            }))}
            activeMap={activeMap}
          />
        </section>
      </main>
    </div>
  );
}
