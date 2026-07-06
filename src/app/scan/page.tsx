import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/db";
import { ScanButton } from "@/components/ScanButton";

// Экран 1: Scan Control — кнопка «Скан» (cooldown-guard), история последних 20 сканов.
export const dynamic = "force-dynamic";

const STATUS_CLS: Record<string, string> = {
  success: "text-diff-new",
  partial: "text-diff-cheaper",
  failed: "text-diff-pricier",
  running: "text-blue-500",
};

export default async function ScanPage() {
  noStore();

  const [scans, scanSetting, lastSuccess, running] = await Promise.all([
    prisma.scan.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
    prisma.setting.findUnique({ where: { key: "scan" } }),
    prisma.scan.findFirst({ where: { status: "success" }, orderBy: { startedAt: "desc" } }),
    prisma.scan.findFirst({ where: { status: "running" } }),
  ]);

  const cooldownMin = (scanSetting?.value as { cooldown_minutes?: number } | null)?.cooldown_minutes ?? 15;
  const cooldownLeft = lastSuccess
    ? Math.max(0, Math.ceil((cooldownMin * 60_000 - (Date.now() - lastSuccess.startedAt.getTime())) / 1000))
    : 0;

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-semibold">Scan Control</h1>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <ScanButton cooldownLeft={cooldownLeft} running={!!running} />
        <span className="text-sm text-neutral-500">cooldown между сканами: {cooldownMin} мин</span>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-neutral-500">История сканов (20)</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-neutral-500">
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                <th className="py-2">#</th>
                <th>Начат</th>
                <th>Статус</th>
                <th className="text-right">Листингов</th>
                <th className="text-right">new</th>
                <th className="text-right">changed</th>
                <th className="text-right">gone</th>
                <th className="text-right">длит.</th>
              </tr>
            </thead>
            <tbody>
              {scans.map((s) => (
                <tr key={s.id} className="border-b border-neutral-100 dark:border-neutral-900">
                  <td className="py-2">{s.id}</td>
                  <td className="whitespace-nowrap">{s.startedAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td className={`font-medium ${STATUS_CLS[s.status] ?? ""}`}>{s.status}</td>
                  <td className="text-right tabular-nums">{s.numListingsSeen ?? "—"}</td>
                  <td className="text-right tabular-nums">{s.numNew ?? "—"}</td>
                  <td className="text-right tabular-nums">{s.numChanged ?? "—"}</td>
                  <td className="text-right tabular-nums">{s.numGone ?? "—"}</td>
                  <td className="text-right tabular-nums">{s.durationMs != null ? `${(s.durationMs / 1000).toFixed(1)}с` : "—"}</td>
                </tr>
              ))}
              {scans.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-3 text-neutral-400">
                    Сканов ещё не было — нажми «Скан».
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
