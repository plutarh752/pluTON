import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { PricePair } from "@/components/PricePair";
import type { Prisma } from "@prisma/client";

// Экран 2: Deal Finder (главный) — листинги по Deal Score убыв., фильтры, редкость, пары цен.
export const dynamic = "force-dynamic";

type Search = { collection?: string; min_usd?: string; max_usd?: string; min_score?: string };
type Attr = { trait_type: string; value: string };

const num = (v: unknown) => (v == null ? null : Number(v));

export default async function DealsPage({ searchParams }: { searchParams: Promise<Search> }) {
  noStore();
  const sp = await searchParams;

  const where: Prisma.ListingWhereInput = { status: "active", dealScore: { not: null } };
  if (sp.collection) where.collection = { slug: sp.collection };
  const minUsd = num(sp.min_usd);
  const maxUsd = num(sp.max_usd);
  if (minUsd != null || maxUsd != null) {
    where.priceUsdNet = { ...(minUsd != null ? { gte: minUsd } : {}), ...(maxUsd != null ? { lte: maxUsd } : {}) };
  }
  const minScore = num(sp.min_score);
  if (minScore != null) where.dealScore = { not: null, gte: minScore };

  const [collections, listings] = await Promise.all([
    prisma.collection.findMany({ orderBy: { name: "asc" } }),
    prisma.listing.findMany({
      where,
      orderBy: { dealScore: "desc" },
      take: 100,
      include: { nftItem: true, collection: true },
    }),
  ]);

  // редкость: подтягиваем только для коллекций в выдаче
  const colIds = [...new Set(listings.map((l) => l.collectionId))];
  const rarities = colIds.length
    ? await prisma.attributeRarity.findMany({ where: { collectionId: { in: colIds } } })
    : [];
  const rarityMap = new Map(rarities.map((r) => [`${r.collectionId}|${r.traitType}|${r.value}`, r.rarityPct]));

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Deal Finder</h1>
        <span className="text-sm text-neutral-500">{listings.length} лотов (top-100 по Deal Score)</span>
      </div>

      <form className="flex flex-wrap items-end gap-3 text-sm" method="get">
        <label className="flex flex-col gap-1">
          <span className="text-neutral-500">Коллекция</span>
          <select name="collection" defaultValue={sp.collection ?? ""} className="rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700">
            <option value="">Все</option>
            {collections.map((c) => (
              <option key={c.id} value={c.slug ?? ""}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-500">$ net от</span>
          <input name="min_usd" type="number" step="any" defaultValue={sp.min_usd ?? ""} className="w-24 rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-500">$ net до</span>
          <input name="max_usd" type="number" step="any" defaultValue={sp.max_usd ?? ""} className="w-24 rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-500">мин. Deal Score</span>
          <input name="min_score" type="number" step="any" defaultValue={sp.min_score ?? ""} className="w-28 rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700" />
        </label>
        <button type="submit" className="rounded bg-neutral-900 px-3 py-1.5 text-white dark:bg-neutral-100 dark:text-neutral-900">Фильтр</button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-neutral-500">
            <tr className="border-b border-neutral-200 dark:border-neutral-800">
              <th className="py-2">Коллекция</th>
              <th>Лот</th>
              <th>Атрибуты (редкость)</th>
              <th className="text-right">Цена</th>
              <th className="text-right">Expected</th>
              <th className="text-right">Deal Score</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {listings.map((l) => {
              const attrs = (l.nftItem.attributes as Attr[] | null) ?? [];
              return (
                <tr key={l.id} className="border-b border-neutral-100 align-top dark:border-neutral-900">
                  <td className="py-2 whitespace-nowrap">{l.collection.name}</td>
                  <td className="whitespace-nowrap font-medium">{l.nftItem.name ?? `#${l.nftItem.id}`}</td>
                  <td>
                    <div className="flex flex-col gap-0.5">
                      {attrs.map((a, i) => {
                        const pct = rarityMap.get(`${l.collectionId}|${a.trait_type}|${a.value}`);
                        return (
                          <span key={i} className="text-xs">
                            <span className="text-neutral-500">{a.trait_type}:</span> {a.value}
                            {pct != null && <span className="text-neutral-400"> ({pct.toFixed(2)}%)</span>}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <PricePair amount={num(l.priceAmount)!} currency="TON" usdNet={num(l.priceUsdNet) ?? 0} />
                  </td>
                  <td className="whitespace-nowrap text-right text-neutral-500">
                    {l.expectedPriceAmount != null ? (
                      <PricePair amount={num(l.expectedPriceAmount)!} currency="TON" usdNet={num(l.expectedPriceUsdNet) ?? 0} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right font-semibold tabular-nums">
                    {l.dealScore != null ? l.dealScore.toFixed(3) : "—"}
                    {l.undervaluationPct != null && (
                      <div className="text-xs font-normal text-neutral-400">undv {(l.undervaluationPct * 100).toFixed(0)}%</div>
                    )}
                  </td>
                  <td className="text-right">
                    {l.marketplaceUrl && (
                      <Link href={l.marketplaceUrl} target="_blank" className="text-xs text-blue-600 hover:underline">
                        маркет ↗
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {listings.length === 0 && <p className="text-neutral-500">Нет лотов под фильтр. Запусти скан или ослабь фильтры.</p>}
    </section>
  );
}
