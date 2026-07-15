import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/db";
import { GetPricesButton } from "@/components/GetPricesButton";
import { Showcase, type ColumnData } from "@/components/Showcase";
import { type BackdropSection } from "@/components/PresetColumn";
import type { LotView } from "@/components/LotCard";
import { sortBackdropsDarkToLight } from "@/lib/backdropColors";
import { GiftSatellite } from "@/lib/giftSatellite";
import { collectionIdMap } from "@/lib/giftPreviews";
import { changesModelImageUrl } from "@/lib/changesTg";
import { freshRunningRun } from "@/lib/priceRun";
import { requireGiftSatelliteConfigured, requireOnboarded } from "@/lib/requireConfigured";

// Экран «Витрина» (Global Price Index): кнопка «Получить цены» + колонки по пресетам (одна модель = один
// столбец), внутри столбца — секции по каждому фону.
export const dynamic = "force-dynamic";

// degraded для столбца = все маркеты пресета упали. marketStatus теперь keyed by presetId.
function isDegraded(marketStatus: unknown, presetId: number): boolean {
  if (!marketStatus || typeof marketStatus !== "object") return false;
  const perPreset = (marketStatus as Record<string, Record<string, string>>)[String(presetId)];
  if (!perPreset) return false;
  const vals = Object.values(perPreset);
  return vals.length > 0 && vals.every((v) => v === "failed");
}

export default async function Home() {
  noStore();
  await requireOnboarded("/");
  await requireGiftSatelliteConfigured("/");

  const [presets, lastRun, running, pricesSetting, lastOk] = await Promise.all([
    prisma.preset.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.priceRun.findFirst({ orderBy: { startedAt: "desc" } }),
    // Свежий running (с учётом STALE_RUNNING_MS) — иначе залипший прогон вечно держит кнопку disabled.
    freshRunningRun(),
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

  // telegramId по коллекциям → чистый арт модели (changes.tg) в заголовке столбца. Кэшировано, best-effort.
  const idMap = await collectionIdMap(new GiftSatellite()).catch(() => ({}) as Record<string, string>);

  // presetId → backdropName → лоты (упорядочены по цене возр. на уровне запроса).
  const byPreset = new Map<number, Map<string, LotView[]>>();
  for (const l of listings) {
    const bd = l.backdropName ?? "—";
    const byBackdrop = byPreset.get(l.presetId) ?? new Map<string, LotView[]>();
    const arr = byBackdrop.get(bd) ?? [];
    arr.push({
      id: l.id,
      slug: l.slug,
      number: l.number,
      market: l.market,
      backdropName: l.backdropName,
      imageUrl: l.imageUrl,
      link: l.link,
      priceTon: Number(l.priceTon),
      priceStars: l.priceStars != null ? Number(l.priceStars) : null,
      priceUsd: l.priceUsd != null ? Number(l.priceUsd) : null,
      floorDeviationPct: l.floorDeviationPct,
    });
    byBackdrop.set(bd, arr);
    byPreset.set(l.presetId, byBackdrop);
  }

  // секции столбца = выбранные фоны пресета, тёмный→светлый; пустые секции показываем тоже.
  function sectionsFor(presetId: number, backdropNames: string[]): BackdropSection[] {
    const byBackdrop = byPreset.get(presetId) ?? new Map<string, LotView[]>();
    return sortBackdropsDarkToLight(backdropNames).map((name) => ({
      backdropName: name,
      lots: byBackdrop.get(name) ?? [],
    }));
  }

  // Сериализуемые данные колонок → клиентский Showcase (фильтр площадок + сортировка по цене).
  const columns: ColumnData[] = presets.map((p, i) => ({
    id: p.id,
    idx: String(i + 1).padStart(3, "0"),
    model: p.modelName,
    collection: p.collectionName,
    imageUrl: changesModelImageUrl(idMap[p.collectionName], p.modelName),
    degraded: isDegraded(lastRun?.marketStatus, p.id),
    sections: sectionsFor(p.id, p.backdropNames),
  }));

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
        <Showcase columns={columns} />
      )}
    </main>
  );
}
