import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/db";
import { getRates } from "@/lib/rates";
import { freshVolumeRun } from "@/lib/volumeRun";
import { changesOriginalImageUrl } from "@/lib/changesTg";
import { isTelegramConfigured } from "@/lib/secrets";
import { requireGiftSatelliteConfigured } from "@/lib/requireConfigured";
import { GetVolumeButton } from "@/components/GetVolumeButton";
import { VolumeTable, type VolumeRow } from "@/components/VolumeTable";

// Экран «Объёмы»: рыночная статистика по ВСЕМ коллекциям (не по личным пресетам). Источник объёма/продаж —
// Portals (authed), собирается кнопкой «Получить объём» в снапшот VolumeRun/CollectionVolume; страница
// read-only читает последний прогон выбранного периода. Картинки коллекций — changes.tg (keyless, инв. 2).
export const dynamic = "force-dynamic";

const PERIODS = new Set(["24h", "7d", "30d"]);

export default async function VolumesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  noStore();
  const sp = await searchParams;
  const period = sp?.period && PERIODS.has(sp.period) ? sp.period : "24h";
  await requireGiftSatelliteConfigured(`/volumes?period=${period}`);

  const [lastRun, running, volumeSetting, lastOk, rates, telegramConfigured] = await Promise.all([
    prisma.volumeRun.findFirst({ where: { period }, orderBy: { startedAt: "desc" } }),
    // Свежий running (с учётом STALE) — залипший прогон не должен держать кнопку disabled навсегда.
    freshVolumeRun(),
    prisma.setting.findUnique({ where: { key: "volume" } }),
    prisma.volumeRun.findFirst({
      where: { status: { in: ["success", "partial"] }, period },
      orderBy: { startedAt: "desc" },
    }),
    getRates(),
    isTelegramConfigured(),
  ]);

  const cooldownMin = (volumeSetting?.value as { cooldown_minutes?: number } | null)?.cooldown_minutes ?? 15;
  const cooldownLeft = lastOk
    ? Math.max(0, Math.ceil((cooldownMin * 60_000 - (Date.now() - lastOk.startedAt.getTime())) / 1000))
    : 0;

  const cvs = lastRun
    ? await prisma.collectionVolume.findMany({ where: { runId: lastRun.id }, orderBy: { volumeTon: "desc" } })
    : [];

  const rows: VolumeRow[] = cvs.map((cv) => ({
    collectionName: cv.collectionName,
    imageUrl: changesOriginalImageUrl(cv.telegramId),
    floorTon: cv.floorTon != null ? Number(cv.floorTon) : null,
    floorUsd: cv.floorTon != null ? Number(cv.floorTon) * rates.ton_usd : null,
    volumeTon: Number(cv.volumeTon),
    volumeUsd: cv.volumeUsd != null ? Number(cv.volumeUsd) : null,
    salesCount: cv.salesCount,
    lastSaleAt: cv.lastSaleAt ? cv.lastSaleAt.toISOString() : null,
    topModels: Array.isArray(cv.topModels)
      ? (cv.topModels as { model?: string }[])
          .map((m) => m?.model)
          .filter((m): m is string => !!m)
          .slice(0, 3)
      : [],
    isPartial: cv.isPartial,
    blockchainAddress: cv.blockchainAddress,
  }));

  const authDead = lastRun?.status === "failed" && lastRun?.authOk === false;

  return (
    <main className="flex min-h-[calc(100vh-64px)] flex-col">
      <section className="flex flex-col items-center justify-center border-b border-outline-variant px-margin-mobile py-12 text-center md:px-margin-desktop">
        <h1 className="mb-4 font-headline-lg text-headline-lg text-primary">Объёмы торгов</h1>
        <p className="mb-8 max-w-2xl text-on-surface-variant">
          Рыночная статистика по всем коллекциям: floor, объём торгов, последняя продажа и топ-3 продаваемых
          модели. Данные — реальный объём с Portals.
        </p>
        <GetVolumeButton
          period={period}
          cooldownLeft={cooldownLeft}
          running={!!running}
          configured={telegramConfigured}
        />
        {!telegramConfigured && (
          <p className="mt-4 max-w-xl rounded border border-amber-500/40 bg-amber-500/10 px-4 py-2 font-mono text-[11px] text-amber-600">
            ⚠ Telegram не настроен — сбор объёма недоступен.{" "}
            <Link href={`/settings?next=${encodeURIComponent(`/volumes?period=${period}`)}`} className="underline">
              Настроить →
            </Link>
          </p>
        )}
        {telegramConfigured && authDead && (
          <p className="mt-4 max-w-xl rounded border border-amber-500/40 bg-amber-500/10 px-4 py-2 font-mono text-[11px] text-amber-600">
            ⚠ Portals-авторизация протухла — обнови Telegram-сессию: <code>npm run portals:login</code> →
            вставь новую сессию в <Link href="/settings" className="underline">Настройках</Link>.
          </p>
        )}
      </section>

      {rows.length === 0 ? (
        <div className="flex flex-grow items-center justify-center p-16 text-center">
          <p className="max-w-md text-on-surface-variant">
            Пока нет данных по объёму. Выбери период и нажми «Получить объём».
          </p>
        </div>
      ) : (
        <section className="px-margin-mobile py-10 md:px-margin-desktop">
          <VolumeTable rows={rows} />
        </section>
      )}
    </main>
  );
}
