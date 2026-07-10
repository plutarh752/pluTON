import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/db";
import { GetPricesButton } from "@/components/GetPricesButton";
import { PresetColumn } from "@/components/PresetColumn";
import type { LotView } from "@/components/LotCard";

// Экран «Витрина» (Global Price Index): кнопка «Получить цены» + колонки лотов по пресетам.
export const dynamic = "force-dynamic";

function isDegraded(marketStatus: unknown, collectionName: string): boolean {
  if (!marketStatus || typeof marketStatus !== "object") return false;
  const perCollection = (marketStatus as Record<string, Record<string, string>>)[collectionName];
  if (!perCollection) return false;
  const vals = Object.values(perCollection);
  return vals.length > 0 && vals.every((v) => v === "failed");
}

export default async function Home() {
  noStore();

  const [presets, lastRun, running, pricesSetting, lastOk] = await Promise.all([
    prisma.preset.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.priceRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.priceRun.findFirst({ where: { status: "running" }, orderBy: { startedAt: "desc" } }),
    prisma.setting.findUnique({ where: { key: "prices" } }),
    prisma.priceRun.findFirst({ where: { status: "success" }, orderBy: { startedAt: "desc" } }),
  ]);

  const cooldownMin = (pricesSetting?.value as { cooldown_minutes?: number } | null)?.cooldown_minutes ?? 3;
  const cooldownLeft = lastOk
    ? Math.max(0, Math.ceil((cooldownMin * 60_000 - (Date.now() - lastOk.startedAt.getTime())) / 1000))
    : 0;

  const listings = lastRun
    ? await prisma.marketListing.findMany({ where: { runId: lastRun.id }, orderBy: { priceTon: "asc" } })
    : [];

  const byPreset = new Map<number, LotView[]>();
  for (const l of listings) {
    const arr = byPreset.get(l.presetId) ?? [];
    arr.push({
      id: l.id,
      slug: l.slug,
      number: l.number,
      market: l.market,
      imageUrl: l.imageUrl,
      link: l.link,
      priceTon: Number(l.priceTon),
      priceStars: l.priceStars != null ? Number(l.priceStars) : null,
      priceUsd: l.priceUsd != null ? Number(l.priceUsd) : null,
      floorDeviationPct: l.floorDeviationPct,
    });
    byPreset.set(l.presetId, arr);
  }

  return (
    <main className="flex min-h-[calc(100vh-64px)] flex-col">
      <section className="flex flex-col items-center justify-center border-b border-outline-variant px-margin-mobile py-12 text-center md:px-margin-desktop">
        <h1 className="mb-4 font-headline-lg text-headline-lg text-primary">Global Price Index</h1>
        <p className="mb-8 max-w-2xl text-on-surface-variant">
          Персональный мультимаркетный трекер. Цены активных лотов по твоим пресетам с MRKT, Portals, Tonnel,
          Telegram и Getgems.
        </p>
        <GetPricesButton cooldownLeft={cooldownLeft} running={!!running} />
      </section>

      {presets.length === 0 ? (
        <div className="flex flex-grow items-center justify-center p-16 text-center">
          <p className="max-w-md text-on-surface-variant">
            Пока нет пресетов. Заведи комбинации на экране «Мои пресеты», затем нажми «Получить цены».
          </p>
        </div>
      ) : (
        <section className="no-scrollbar flex flex-grow overflow-x-auto overflow-y-hidden bg-surface-container-lowest">
          {presets.map((p, i) => (
            <PresetColumn
              key={p.id}
              idx={String(i + 1).padStart(3, "0")}
              model={p.modelName}
              backdrop={p.backdropName}
              lots={byPreset.get(p.id) ?? []}
              degraded={isDegraded(lastRun?.marketStatus, p.collectionName)}
            />
          ))}
        </section>
      )}
    </main>
  );
}
