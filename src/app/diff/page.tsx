import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/db";
import { PricePair } from "@/components/PricePair";
import type { ListingEventType } from "@prisma/client";

// Экран 3: Scan Diff — что изменилось на последнем скане (по listing_events).
export const dynamic = "force-dynamic";

const num = (v: unknown) => (v == null ? null : Number(v));

type Group = { key: string; title: string; cls: string; types: ListingEventType[] };
const GROUPS: Group[] = [
  { key: "new", title: "Новые", cls: "bg-diff-new", types: ["new", "reappeared"] },
  { key: "cheaper", title: "Подешевели", cls: "bg-diff-cheaper", types: ["price_down"] },
  { key: "pricier", title: "Подорожали", cls: "bg-diff-pricier", types: ["price_up"] },
  { key: "gone", title: "Ушли (продажа/делист)", cls: "bg-diff-gone", types: ["sold", "delisted"] },
];

export default async function DiffPage({ searchParams }: { searchParams: Promise<{ scan_id?: string }> }) {
  noStore();
  const sp = await searchParams;

  const scan = sp.scan_id
    ? await prisma.scan.findUnique({ where: { id: Number(sp.scan_id) } })
    : await prisma.scan.findFirst({ orderBy: { startedAt: "desc" } });

  if (!scan) return <p className="text-neutral-500">Ещё не было ни одного скана.</p>;

  const events = await prisma.listingEvent.findMany({
    where: { scanId: scan.id },
    include: { nftItem: { select: { name: true } }, collection: { select: { name: true } } },
    orderBy: { id: "asc" },
  });

  const byType = new Map<ListingEventType, typeof events>();
  for (const e of events) {
    if (!byType.has(e.eventType)) byType.set(e.eventType, []);
    byType.get(e.eventType)!.push(e);
  }

  return (
    <section className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Scan Diff</h1>
        <span className="text-sm text-neutral-500">
          скан #{scan.id} · {scan.startedAt.toISOString().slice(0, 16).replace("T", " ")} · всего изменений: {events.length}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {GROUPS.map((g) => {
          const rows = g.types.flatMap((t) => byType.get(t) ?? []);
          return (
            <div key={g.key} className="rounded-lg border border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${g.cls}`} />
                  {g.title}
                </span>
                <span className="text-xs text-neutral-500">{rows.length}</span>
              </div>
              <div className="max-h-72 overflow-y-auto border-t border-neutral-100 text-sm dark:border-neutral-900">
                {rows.slice(0, 50).map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-2 px-3 py-1.5 odd:bg-neutral-50 dark:odd:bg-neutral-900/40">
                    <span className="truncate">
                      <span className="text-neutral-400">{e.collection.name}</span> {e.nftItem.name}
                    </span>
                    <span className="whitespace-nowrap text-right">
                      {e.newPriceAmount != null ? (
                        <PricePair amount={num(e.newPriceAmount)!} currency="TON" usdNet={num(e.newPriceUsdNet) ?? 0} />
                      ) : e.oldPriceAmount != null ? (
                        <span className="text-neutral-400 line-through">
                          <PricePair amount={num(e.oldPriceAmount)!} currency="TON" usdNet={num(e.oldPriceUsdNet) ?? 0} />
                        </span>
                      ) : (
                        "—"
                      )}
                      {e.priceDeltaPct != null && (
                        <span className="ml-1 text-xs text-neutral-400">{e.priceDeltaPct > 0 ? "+" : ""}{e.priceDeltaPct.toFixed(0)}%</span>
                      )}
                    </span>
                  </div>
                ))}
                {rows.length === 0 && <div className="px-3 py-3 text-xs text-neutral-400">пусто</div>}
                {rows.length > 50 && <div className="px-3 py-2 text-xs text-neutral-400">…и ещё {rows.length - 50}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
