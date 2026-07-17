// Воркер «Получить объём» (PluTON v2, вкладка «Объёмы»): тянет РЕАЛЬНЫЙ объём/продажи из Portals
// (authed, через Python-сайдкар worker/portals_fetch.py), агрегирует по коллекции за окно периода
// (24ч/7д/30д) и пишет снапшот в CollectionVolume + статус в VolumeRun. Контур — как «Получить цены»:
// стартует только по сигналу (кнопка/CLI), не фоновый поллинг.
//
// Первым шагом — health-check Portals-авторизации (assertPortalsAuth): если tma протух, прогон падает
// ГРОМКО и понятно ДО обхода коллекций (требование задачи), а не молча в глубине.
//
// Запуск: npm run worker:volume -- --period=24h            (с учётом cooldown)
//         npm run worker:volume -- --period=7d --force     (игнорировать cooldown)
import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { TonApi } from "../src/lib/tonapi";
import { giftstatCollections } from "../src/lib/giftstat";
import { assertPortalsAuth, fetchPortalsRun, type PortalsSale } from "../src/lib/portals";
import { tonToUsd, type Rates } from "../src/lib/format";
import { createProgress, clearRunProgress } from "../src/lib/progress";

const PERIODS = new Set(["24h", "7d", "30d"]);

async function loadSettings() {
  const rows = await prisma.setting.findMany();
  const s: Record<string, any> = {};
  for (const r of rows) s[r.key] = r.value;
  return s;
}

/** Топ-3 продаваемых моделей за период по числу продаж. */
function topModelsFrom(sales: PortalsSale[]): { model: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of sales) {
    if (!s.model) continue;
    counts.set(s.model, (counts.get(s.model) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([model, count]) => ({ model, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
}

/** Максимальный (самый свежий) timestamp продажи → время последней сделки. */
function lastSaleFrom(sales: PortalsSale[]): Date | null {
  let max: number | null = null;
  for (const s of sales) {
    if (!s.ts) continue;
    const t = Date.parse(s.ts);
    if (Number.isFinite(t) && (max == null || t > max)) max = t;
  }
  return max == null ? null : new Date(max);
}

async function main() {
  const argv = process.argv.slice(2);
  const force = argv.includes("--force");
  const runIdArg = argv.find((a) => a.startsWith("--run-id="));
  const adoptedRunId = runIdArg ? Number(runIdArg.slice("--run-id=".length)) : null;
  const periodArg = argv.find((a) => a.startsWith("--period="));
  const period = periodArg ? periodArg.slice("--period=".length) : "24h";
  if (!PERIODS.has(period)) {
    console.error(`неизвестный период "${period}" (ожидался 24h|7d|30d)`);
    await prisma.$disconnect();
    process.exit(1);
  }
  const settings = await loadSettings();

  // cooldown-guard только для самостоятельного запуска (роут уже отработал guard и прокинул --run-id).
  // Per-period: разные периоды можно запускать подряд, один и тот же — не спамить (щадим Portals).
  if (adoptedRunId == null) {
    const cooldownMin = settings.volume?.cooldown_minutes ?? 15;
    const lastOk = await prisma.volumeRun.findFirst({
      where: { status: { in: ["success", "partial"] }, period },
      orderBy: { startedAt: "desc" },
    });
    if (lastOk && !force) {
      const ageMs = Date.now() - lastOk.startedAt.getTime();
      if (ageMs < cooldownMin * 60_000) {
        const left = Math.ceil((cooldownMin * 60_000 - ageMs) / 60_000);
        console.log(`⏳ cooldown: до следующего прогона объёма (${period}) ~${left} мин. --force для обхода.`);
        await prisma.$disconnect();
        return;
      }
    }
  }

  // взять созданную роутом строку прогона или создать свою (самостоятельный запуск).
  let run;
  if (adoptedRunId != null) {
    const existing = await prisma.volumeRun.findUnique({ where: { id: adoptedRunId } });
    if (!existing) {
      console.error(`volume run #${adoptedRunId} не найден — прерываю (роут должен был его создать).`);
      await prisma.$disconnect();
      return;
    }
    run = existing;
  } else {
    run = await prisma.volumeRun.create({ data: { status: "running", trigger: "worker", period } });
  }
  console.log(`▶ volume run #${run.id} | период: ${period}`);
  const progress = createProgress("volume", run.id);
  await progress.update({ phase: "Проверка авторизации Portals…", total: 0, done: 0, label: "" }, true);

  // 1) HEALTH-CHECK Portals-авторизации — ДО любой работы. Провал → громкий баннер + failed-прогон.
  try {
    await assertPortalsAuth();
  } catch (e) {
    await clearRunProgress("volume");
    await prisma.volumeRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        authOk: false,
        finishedAt: new Date(),
        error: `portals_auth: ${(e as Error).message}`.slice(0, 500),
        durationMs: Date.now() - run.startedAt.getTime(),
      },
    });
    await prisma.$disconnect();
    process.exit(1);
  }
  await prisma.volumeRun.update({ where: { id: run.id }, data: { authOk: true } });

  // 2) курс TON→USD (для $), как в worker/prices.ts.
  await progress.update({ phase: "Курс TON→USD…" }, true);
  let tonUsd = settings.rates?.ton_usd ?? 1.78;
  try {
    tonUsd = await new TonApi().getTonUsd();
    await prisma.setting.upsert({
      where: { key: "rates" },
      create: { key: "rates", value: { ...(settings.rates ?? {}), ton_usd: tonUsd } },
      update: { value: { ...(settings.rates ?? {}), ton_usd: tonUsd } },
    });
  } catch (e) {
    console.warn(`  ! ton_usd не обновлён, используем ${tonUsd}: ${(e as Error).message}`);
  }
  const rates: Rates = { ton_usd: tonUsd, stars_usd: settings.rates?.stars_usd ?? 0.013 };

  // 3) картинки/адреса коллекций: telegramId + blockchain_address (ссылка на Getgems) из каталога Giftstat
  //    (keyless, единственный источник теперь — раньше был gift-satellite-first + Giftstat-фолбэк).
  //    Best-effort.
  await progress.update({ phase: "Каталог коллекций…" }, true);
  const meta: Record<string, { telegramId: string; blockchainAddress?: string }> = {};
  for (const c of await giftstatCollections().catch(() => [])) meta[c.name] = c;

  // 4) Portals: минт tma один раз, обход всех коллекций за окно периода (per-collection пагинация feed).
  //    Сайдкар шлёт per-collection прогресс (stderr `@P`) → живой прогресс-бар + лог в UI. Первый минт tma
  //    может занять несколько секунд — до первого `@P` держим фазу «Подключение к Portals…».
  await progress.update({ phase: "Подключение к Portals (минт tma)…" }, true);
  const limit = settings.volume?.collections_limit ?? 500;
  const portals = await fetchPortalsRun(period, limit, (p) => {
    void progress.update({
      phase: "Сбор объёма по коллекциям",
      total: p.total,
      done: p.done,
      label: p.label || "…",
    });
  });
  if (portals.sample != null) {
    console.log(`  · schema sample (первый action Portals): ${JSON.stringify(portals.sample).slice(0, 400)}`);
  }

  // 5) агрегация по коллекции.
  await progress.update({ phase: "Агрегация и сохранение…", label: "" }, true);
  const rows: Prisma.CollectionVolumeCreateManyInput[] = [];
  let partialCount = 0;
  for (const c of portals.collections) {
    const salesVol = c.sales.reduce((sum, s) => sum + (s.priceTon || 0), 0);
    // 24ч — авторитетный нативный daily volume; 7д/30д — сумма продаж за окно.
    const volumeTon = period === "24h" ? c.volume24hTon ?? salesVol : salesVol;
    // isPartial семантически про полноту ОБЪЁМА: у 24ч объём нативный (полон); у 7д/30д — про глубину feed.
    const isPartial = period === "24h" ? false : c.capped || c.budgetSkipped;
    if (isPartial) partialCount++;
    const top = topModelsFrom(c.sales);
    const lastSaleAt = lastSaleFrom(c.sales);
    rows.push({
      runId: run.id,
      telegramId: meta[c.name]?.telegramId ?? null,
      collectionName: c.name,
      floorTon: c.floorTon ?? null,
      volumeTon,
      volumeUsd: rates.ton_usd ? tonToUsd(volumeTon, rates) : null,
      salesCount: c.sales.length,
      lastSaleAt,
      topModels: top.length ? (top as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      isPartial,
      blockchainAddress: meta[c.name]?.blockchainAddress ?? null,
    });
  }

  if (rows.length) await prisma.collectionVolume.createMany({ data: rows });

  // 6) статус прогона.
  const status = rows.length === 0 ? "failed" : partialCount > 0 ? "partial" : "success";
  await prisma.volumeRun.update({
    where: { id: run.id },
    data: {
      status,
      finishedAt: new Date(),
      collectionsCount: rows.length,
      durationMs: Date.now() - run.startedAt.getTime(),
      ...(rows.length === 0 ? { error: "Portals не вернул коллекций" } : {}),
    },
  });

  // 7) чистим прошлые прогоны ЭТОГО периода (оставляем последний на каждый период) — cascade убирает их строки.
  await prisma.volumeRun.deleteMany({ where: { period, id: { not: run.id } } });
  await clearRunProgress("volume");

  console.log(
    `■ volume run #${run.id} done: status=${status} collections=${rows.length} partial=${partialCount}`
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
