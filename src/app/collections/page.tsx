import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/db";

// Экран 4: Collection Explorer (УРЕЗАН в MVP) — список коллекций с floor'ами (читается из БД).
export const dynamic = "force-dynamic"; // всегда свежие данные из БД, не кэш

export default async function CollectionsPage() {
  noStore();
  const cols = await prisma.collection.findMany({
    orderBy: { id: "asc" },
    include: { _count: { select: { listings: true, nftItems: true } } },
  });

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Коллекции</h1>
      <p className="text-sm text-neutral-500">
        Список из БД (watchlist). Floor/объёмы наполняются сканом. Данные читаются через Prisma + Neon adapter.
      </p>
      <table className="w-full text-sm">
        <thead className="text-left text-neutral-500">
          <tr className="border-b border-neutral-200 dark:border-neutral-800">
            <th className="py-2">#</th>
            <th>Коллекция</th>
            <th>Supply</th>
            <th>Items в БД</th>
            <th>Листингов</th>
            <th>Адрес</th>
          </tr>
        </thead>
        <tbody>
          {cols.map((c) => (
            <tr key={c.id} className="border-b border-neutral-100 dark:border-neutral-900">
              <td className="py-2">{c.id}</td>
              <td className="font-medium">{c.name}</td>
              <td className="tabular-nums">{c.totalSupply ?? "—"}</td>
              <td className="tabular-nums">{c._count.nftItems}</td>
              <td className="tabular-nums">{c._count.listings}</td>
              <td className="font-mono text-xs text-neutral-500">{c.address.slice(0, 10)}…</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
