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
import { marketLabel } from "../src/lib/markets";
import { createProgress, clearRunProgress } from "../src/lib/progress";

async function loadSettings() {
  const rows = await prisma.setting.findMany();
  const s: Record<string, any> = {};
  for (const r of rows) s[r.key] = r.value;
  return s;
}

async function main() {
  const argv = process.argv.slice(2);
  const force = argv.includes("--force");
  // Роут /api/prices создаёт строку PriceRun{running} синхронно (running-guard) и прокидывает её id сюда.
  // Тогда воркер БЕРЁТ её (не создаёт вторую) и НЕ проверяет cooldown — guard уже отработал в роуте.
  const runIdArg = argv.find((a) => a.startsWith("--run-id="));
  const adoptedRunId = runIdArg ? Number(runIdArg.slice("--run-id=".length)) : null;
  const settings = await loadSettings();

  // cooldown-guard только для самостоятельного запуска (npm run worker:prices / прод без роута).
  if (adoptedRunId == null) {
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
  }

  const presets = await prisma.preset.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });

  // взять созданную роутом строку прогона или создать свою (самостоятельный запуск).
  let run;
  if (adoptedRunId != null) {
    const existing = await prisma.priceRun.findUnique({ where: { id: adoptedRunId } });
    if (!existing) {
      console.error(`run #${adoptedRunId} не найден — прерываю (роут должен был его создать).`);
      await prisma.$disconnect();
      return;
    }
    run = existing;
    await prisma.priceRun.update({ where: { id: run.id }, data: { presetsCount: presets.length } });
  } else {
    run = await prisma.priceRun.create({
      data: { status: "running", trigger: "worker", presetsCount: presets.length },
    });
  }
  console.log(`▶ price run #${run.id} | пресетов: ${presets.length}`);
  const progress = createProgress("prices", run.id);
  await progress.update({ phase: "Курс TON→USD…", total: 0, done: 0, label: "" }, true);

  if (presets.length === 0) {
    await clearRunProgress("prices");
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
  await progress.update({ phase: "Floor коллекций…" }, true);
  let offersByCollection = new Map<string, GsCollectionOffers>();
  try {
    const offers = await gs.getCollectionOffers();
    offersByCollection = new Map(offers.map((o) => [o.collectionName, o]));
  } catch (e) {
    console.warn(`  ! collection-offers недоступны (floor неизвестен): ${(e as Error).message}`);
  }

  // все (пресет × маркет × фон) запросы; лимитер клиента держит интервалы per-market (маркеты параллельно).
  // По каждому фону — отдельный /search: секция фона на витрине гарантированно показывает свои лоты
  // (без обрезки общим лимитом в 50). Больше задач ⇒ прогон дольше (особенно tg: 1 запрос / 1.5с).
  interface Task {
    preset: (typeof presets)[number];
    market: (typeof MARKETS)[number];
    backdrop: string;
  }
  const tasks: Task[] = [];
  for (const preset of presets)
    for (const market of MARKETS)
      for (const backdrop of preset.backdropNames) tasks.push({ preset, market, backdrop });

  // Прогресс: total = число задач; done растёт по мере оседания каждого запроса (маркеты параллельно,
  // лимитер разносит их во времени). Пишем throttled'ом, не блокируя сам сбор (fire-and-forget).
  let done = 0;
  await progress.update({ phase: "Опрос маркетов…", total: tasks.length, done: 0, label: "" }, true);
  const settled = await Promise.allSettled(
    tasks.map((t) =>
      gs
        .searchMarket(t.market, t.preset.collectionName, {
          models: [t.preset.modelName],
          backdrops: [t.backdrop],
        })
        .finally(() => {
          done++;
          void progress.update({ done, label: `${t.preset.collectionName} · ${marketLabel(t.market)} · ${t.backdrop}` });
        })
    )
  );
  await progress.update({ phase: "Сохранение снапшота…", done: tasks.length, label: "" }, true);

  // marketStatus[presetId][market] = "ok" | "failed" — degraded теперь per-столбец (модель), а не по
  // коллекции целиком. ok, если хоть один фон пары (пресет, маркет) успешен.
  const marketStatus: Record<string, Record<string, string>> = {};
  const rows: Prisma.MarketListingCreateManyInput[] = [];

  settled.forEach((res, i) => {
    const { preset, market, backdrop } = tasks[i];
    const col = preset.collectionName;
    const pk = String(preset.id);
    marketStatus[pk] ??= {};
    const prev = marketStatus[pk][market];

    if (res.status === "rejected") {
      if (prev !== "ok") marketStatus[pk][market] = "failed";
      return;
    }
    marketStatus[pk][market] = "ok";

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
        backdropName: l.backdropName ?? backdrop, // фон из ответа API; фолбэк — фон запроса
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

  await clearRunProgress("prices");
  console.log(`■ price run #${run.id} done: status=${status} lots=${rows.length} ok-pairs=${okCount}/${pairs.length}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
