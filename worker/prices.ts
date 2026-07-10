// Воркер «Получить цены» (PluTON v2): по каждому пресету тянет активные лоты со всех маркетов через
// gift-satellite, считает TON/⭐/$ и % от floor, пишет снапшот в MarketListing + статус в PriceRun.
// Это движок кнопки «Получить цены» (аналог скана): стартует только по сигналу, не фоновый поллинг.
//
// Запуск: npm run worker:prices            (с учётом cooldown)
//         npm run worker:prices -- --force (игнорировать cooldown)
import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { TonApi } from "../src/lib/tonapi";
import {
  GiftSatellite,
  MARKETS,
  collectionFloorFromOffers,
  giftImageUrl,
  parseNumberFromSlug,
  type GsCollectionOffers,
} from "../src/lib/giftSatellite";
import { tonToStars, tonToUsd, type Rates } from "../src/lib/format";

async function loadSettings() {
  const rows = await prisma.setting.findMany();
  const s: Record<string, any> = {};
  for (const r of rows) s[r.key] = r.value;
  return s;
}

async function main() {
  const force = process.argv.slice(2).includes("--force");
  const settings = await loadSettings();

  // cooldown-guard по последнему успешному прогону (settings.prices.cooldown_minutes, default 3).
  const cooldownMin = settings.prices?.cooldown_minutes ?? 3;
  const lastOk = await prisma.priceRun.findFirst({ where: { status: "success" }, orderBy: { startedAt: "desc" } });
  if (lastOk && !force) {
    const ageMs = Date.now() - lastOk.startedAt.getTime();
    if (ageMs < cooldownMin * 60_000) {
      const left = Math.ceil((cooldownMin * 60_000 - ageMs) / 60_000);
      console.log(`⏳ cooldown: до следующего сбора ~${left} мин (последний #${lastOk.id}). --force для обхода.`);
      await prisma.$disconnect();
      return;
    }
  }

  const presets = await prisma.preset.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const run = await prisma.priceRun.create({
    data: { status: "running", trigger: "worker", presetsCount: presets.length },
  });
  console.log(`▶ price run #${run.id} | пресетов: ${presets.length}`);

  if (presets.length === 0) {
    await prisma.priceRun.update({
      where: { id: run.id },
      data: { status: "success", finishedAt: new Date(), lotsCount: 0, marketStatus: {}, durationMs: Date.now() - run.startedAt.getTime() },
    });
    console.log("нет пресетов — нечего собирать.");
    await prisma.$disconnect();
    return;
  }

  // курс TON→USD (для $ и ⭐), сохраняем в settings.rates как и скан.
  let tonUsd = settings.rates?.ton_usd ?? 1.78;
  try {
    tonUsd = await new TonApi().getTonUsd();
    await prisma.setting.upsert({
      where: { key: "rates" },
      create: { key: "rates", value: { ...(settings.rates ?? {}), ton_usd: tonUsd } },
      update: { value: { ...(settings.rates ?? {}), ton_usd: tonUsd } },
    });
  } catch (e) {
    console.warn(`  ! не удалось обновить ton_usd, используем ${tonUsd}: ${(e as Error).message}`);
  }
  const rates: Rates = { ton_usd: tonUsd, stars_usd: settings.rates?.stars_usd ?? 0.013 };

  const gs = new GiftSatellite();

  // floor по коллекциям (одним запросом; при ошибке — floor неизвестен, чипы просто не рисуем).
  let offersByCollection = new Map<string, GsCollectionOffers>();
  try {
    const offers = await gs.getCollectionOffers();
    offersByCollection = new Map(offers.map((o) => [o.collectionName, o]));
  } catch (e) {
    console.warn(`  ! collection-offers недоступны (floor неизвестен): ${(e as Error).message}`);
  }

  // все (пресет × маркет) запросы; лимитер клиента сам держит интервалы per-market (маркеты параллельно).
  interface Task {
    preset: (typeof presets)[number];
    market: (typeof MARKETS)[number];
  }
  const tasks: Task[] = [];
  for (const preset of presets) for (const market of MARKETS) tasks.push({ preset, market });

  const settled = await Promise.allSettled(
    tasks.map((t) =>
      gs.searchMarket(t.market, t.preset.collectionName, {
        models: [t.preset.modelName],
        backdrops: [t.preset.backdropName],
      })
    )
  );

  // marketStatus[collectionName][market] = "ok" | "failed" (ok, если хоть один запрос пары успешен).
  const marketStatus: Record<string, Record<string, string>> = {};
  const rows: Prisma.MarketListingCreateManyInput[] = [];

  settled.forEach((res, i) => {
    const { preset, market } = tasks[i];
    const col = preset.collectionName;
    marketStatus[col] ??= {};
    const prev = marketStatus[col][market];

    if (res.status === "rejected") {
      if (prev !== "ok") marketStatus[col][market] = "failed";
      return;
    }
    marketStatus[col][market] = "ok";

    const floorTon = offersByCollection.has(col) ? collectionFloorFromOffers(offersByCollection.get(col)!) : null;
    for (const l of res.value) {
      const priceTon = l.normalizedPrice;
      rows.push({
        runId: run.id,
        presetId: preset.id,
        collectionName: col,
        market,
        slug: l.slug,
        giftId: l.giftId ?? null,
        number: parseNumberFromSlug(l.slug),
        modelName: l.modelName ?? preset.modelName,
        backdropName: l.backdropName ?? preset.backdropName,
        symbolName: l.symbolName ?? null,
        priceTon,
        priceStars: rates.stars_usd ? tonToStars(priceTon, rates) : null,
        priceUsd: rates.ton_usd ? tonToUsd(priceTon, rates) : null,
        floorTon,
        floorDeviationPct: floorTon && floorTon > 0 ? ((priceTon - floorTon) / floorTon) * 100 : null,
        imageUrl: giftImageUrl(l.slug),
        link: l.link ?? null,
      });
    }
  });

  if (rows.length) await prisma.marketListing.createMany({ data: rows });

  // статус прогона: success (все пары ok), failed (все пары failed), иначе partial.
  const pairs = Object.values(marketStatus).flatMap((m) => Object.values(m));
  const okCount = pairs.filter((v) => v === "ok").length;
  const status = okCount === 0 ? "failed" : okCount === pairs.length ? "success" : "partial";

  await prisma.priceRun.update({
    where: { id: run.id },
    data: {
      status,
      finishedAt: new Date(),
      lotsCount: rows.length,
      marketStatus,
      durationMs: Date.now() - run.startedAt.getTime(),
      ...(status === "failed" ? { error: "все маркеты недоступны" } : {}),
    },
  });

  // чистим снапшоты прошлых прогонов (витрина читает только текущий run).
  await prisma.marketListing.deleteMany({ where: { runId: { not: run.id } } });

  console.log(`■ price run #${run.id} done: status=${status} lots=${rows.length} ok-pairs=${okCount}/${pairs.length}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
