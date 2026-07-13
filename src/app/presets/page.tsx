import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/db";
import { SideNav } from "@/components/Nav";
import { PresetForm } from "@/components/PresetForm";
import { PresetList } from "@/components/PresetList";
import { GiftSatellite } from "@/lib/giftSatellite";
import { cachedModelImageUrl } from "@/lib/giftPreviews";

// Экран «Мои пресеты»: каскадная форма + список сохранённых комбинаций.
export const dynamic = "force-dynamic";

export default async function PresetsPage() {
  noStore();
  const presets = await prisma.preset.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });

  // Бэкфилл фото для пресетов, созданных до фичи (previewImageUrl=null): картинка модели с недельным
  // кэшем, best-effort. Заполняем и в БД (самолечение), и в текущем рендере.
  const missing = presets.filter((p) => !p.previewImageUrl);
  if (missing.length) {
    const gs = new GiftSatellite();
    await Promise.all(
      missing.map(async (p) => {
        try {
          const url = await cachedModelImageUrl(gs, p.collectionName, p.modelName);
          if (url) {
            await prisma.preset.update({ where: { id: p.id }, data: { previewImageUrl: url } });
            p.previewImageUrl = url;
          }
        } catch {
          // картинка недоступна — оставим плейсхолдер.
        }
      })
    );
  }

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
              backdropNames: p.backdropNames,
              previewImageUrl: p.previewImageUrl,
            }))}
            activeMap={activeMap}
          />
        </section>
      </main>
    </div>
  );
}
