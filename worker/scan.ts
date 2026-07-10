// Legacy tonapi-скан (PluTON v2): каталог/атрибуты/редкость + on-chain листинги (в основном Getgems) с
// дельта-хранением и вменёнными продажами. ВНЕ пути витрины — оставлен как вспомогательный/фолбэк-пайплайн.
// Deal Score/премия за редкость удалены (продукт — мультимаркетный трекер на gift-satellite, не Deal Finder).
//
// Запуск: npm run worker:scan            (весь watchlist, с учётом cooldown)
//         npm run worker:scan -- --force (игнорировать cooldown)
//         npm run worker:scan -- EQBG... (одна коллекция из watchlist)
import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { TonApi, saleToPriceTon } from "../src/lib/tonapi";
import { computeRarity, type Attribute } from "../src/lib/scoring";
import { inferSales, type CurrentItemState } from "./inferSales";
import { upsertItems, upsertRarity, getItemIdMap } from "./persist";
import { toFriendlyAddress } from "../src/lib/address";

async function loadSettings() {
  const rows = await prisma.setting.findMany();
  const s: Record<string, any> = {};
  for (const r of rows) s[r.key] = r.value;
  return s;
}

// itemAddr из tonapi — raw (`0:hex`); getgems резолвит только friendly (EQ…). См. src/lib/address.ts.
function getgemsUrl(collectionAddr: string, itemAddr: string) {
  return `https://getgems.io/collection/${collectionAddr}/${toFriendlyAddress(itemAddr)}`;
}

// Getgems → getgems; иначе — нейтральный tonviewer (всегда резолвит текущий on-chain sale). См. инвариант 2.
function marketUrl(marketName: string | null | undefined, collectionAddr: string, itemAddr: string) {
  if (marketName && /getgems/i.test(marketName)) return getgemsUrl(collectionAddr, itemAddr);
  return `https://tonviewer.com/${toFriendlyAddress(itemAddr)}`;
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const only = args.find((a) => a.startsWith("EQ") || a.startsWith("0:"));

  const api = new TonApi();
  const settings = await loadSettings();

  // cooldown-guard
  const cooldownMin = settings.scan?.cooldown_minutes ?? 15;
  const last = await prisma.scan.findFirst({ where: { status: "success" }, orderBy: { startedAt: "desc" } });
  if (last && !force) {
    const ageMs = Date.now() - last.startedAt.getTime();
    if (ageMs < cooldownMin * 60_000) {
      const left = Math.ceil((cooldownMin * 60_000 - ageMs) / 60_000);
      console.log(`⏳ cooldown: до следующего скана ~${left} мин (последний #${last.id}). --force для обхода.`);
      await prisma.$disconnect();
      return;
    }
  }

  // актуальный курс TON→USD (для gross usd на листингах) + сохранить в settings.rates
  const tonUsd = await api.getTonUsd();
  await prisma.setting.upsert({
    where: { key: "rates" },
    create: { key: "rates", value: { ...(settings.rates ?? {}), ton_usd: tonUsd } },
    update: { value: { ...(settings.rates ?? {}), ton_usd: tonUsd } },
  });

  // коллекции из watchlist (пересечь с БД, чтобы получить id)
  const dbCollections = await prisma.collection.findMany();
  const byAddress = new Map(dbCollections.map((c) => [c.address, c]));
  let targets = (settings.watchlist ?? []) as { name: string; slug: string; address: string }[];
  if (only) targets = targets.filter((t) => t.address === only);
  if (targets.length === 0) {
    console.log("Нет коллекций для скана (watchlist пуст или адрес не найден).");
    await prisma.$disconnect();
    return;
  }

  const scan = await prisma.scan.create({ data: { status: "running", trigger: "worker", scannedCollectionIds: [] } });
  console.log(`▶ scan #${scan.id} | TON=$${tonUsd.toFixed(4)} | коллекций: ${targets.length}`);

  const scannedIds: number[] = [];
  let totNew = 0;
  let totChanged = 0;
  let totGone = 0;
  let totSeen = 0;
  let hadError = false;

  for (const t of targets) {
    const col = byAddress.get(t.address);
    if (!col) {
      console.warn(`  ! ${t.name}: нет в БД, пропуск`);
      continue;
    }
    try {
      const { seen, nnew, nchanged, ngone } = await scanCollection(col.id, col.address, t.name, {
        api,
        tonUsd,
        scanId: scan.id,
      });
      scannedIds.push(col.id);
      totSeen += seen;
      totNew += nnew;
      totChanged += nchanged;
      totGone += ngone;
      console.log(`  ✓ ${t.name}: seen=${seen} new=${nnew} changed=${nchanged} gone=${ngone}`);
    } catch (e) {
      hadError = true;
      console.error(`  ! ${t.name}: ${(e as Error).message}`);
    }
  }

  await prisma.scan.update({
    where: { id: scan.id },
    data: {
      status: hadError ? "partial" : "success",
      finishedAt: new Date(),
      scannedCollectionIds: scannedIds,
      numListingsSeen: totSeen,
      numNew: totNew,
      numChanged: totChanged,
      numGone: totGone,
      durationMs: Date.now() - scan.startedAt.getTime(),
    },
  });
  console.log(`■ scan #${scan.id} done: seen=${totSeen} new=${totNew} changed=${totChanged} gone=${totGone}`);
  await prisma.$disconnect();
}

interface Ctx {
  api: TonApi;
  tonUsd: number;
  scanId: number;
}

async function scanCollection(collectionId: number, address: string, name: string, ctx: Ctx) {
  const { api, tonUsd, scanId } = ctx;

  const items = await api.getCollectionItems(address);
  await prisma.collection.update({ where: { id: collectionId }, data: { totalSupply: items.length, name } });
  await upsertItems(prisma, collectionId, items);

  const rarity = computeRarity(
    items.map((i) => (i.metadata?.attributes ?? []) as Attribute[]),
    items.length
  );
  await upsertRarity(prisma, collectionId, rarity);

  const idMap = await getItemIdMap(prisma, collectionId);

  // текущее состояние: листинги (on-sale c ценой) + карта состояний для inferSales
  interface Cur {
    nftItemId: number;
    address: string;
    priceTon: number;
    marketplace: string | null;
    sellerAddress: string | null;
  }
  const currentListings: Cur[] = [];
  const currentState = new Map<number, CurrentItemState>();
  const seenListing = new Set<number>();
  for (const it of items) {
    const id = idMap.get(it.address);
    if (id == null) continue;
    const priceTon = saleToPriceTon(it.sale);
    // is_wallet-sale исключаем: wallet-сделки/стухшие контракты (tonapi отдаёт sale и для failed). Инвариант 2.
    const onSale = it.sale != null && priceTon != null && priceTon > 0 && it.sale.market?.is_wallet !== true;
    currentState.set(id, { nftItemId: id, onSale, ownerAddress: it.owner?.address ?? null });
    if (onSale && !seenListing.has(id)) {
      seenListing.add(id);
      currentListings.push({
        nftItemId: id,
        address: it.address,
        priceTon: priceTon!,
        marketplace: it.sale?.market?.name ?? null,
        sellerAddress: it.sale?.owner?.address ?? null,
      });
    }
  }

  const grossUsd = (priceTon: number) => priceTon * tonUsd;

  // дельты против текущего стейта в БД
  const existing = await prisma.listing.findMany({ where: { collectionId } });
  const byItem = new Map(existing.map((l) => [l.nftItemId, l]));

  const newListings: Prisma.ListingCreateManyInput[] = [];
  const events: Prisma.ListingEventCreateManyInput[] = [];
  const saleCreates: Prisma.SaleCreateManyInput[] = [];
  let nnew = 0;
  let nchanged = 0;
  let ngone = 0;

  for (const c of currentListings) {
    const priceUsd = grossUsd(c.priceTon);
    const ex = byItem.get(c.nftItemId);
    if (!ex) {
      nnew++;
      newListings.push({
        nftItemId: c.nftItemId,
        collectionId,
        marketplace: c.marketplace,
        marketplaceUrl: marketUrl(c.marketplace, address, c.address),
        currency: "TON",
        priceAmount: c.priceTon,
        priceUsdNet: priceUsd,
        status: "active",
        sellerAddress: c.sellerAddress,
        listedAt: new Date(),
        priceUpdatedAt: new Date(),
        firstSeenScanId: scanId,
        lastSeenScanId: scanId,
      });
      events.push({
        scanId,
        nftItemId: c.nftItemId,
        collectionId,
        eventType: "new",
        newPriceAmount: c.priceTon,
        newPriceUsdNet: priceUsd,
      });
    } else {
      const oldPrice = ex.priceAmount != null ? Number(ex.priceAmount) : null;
      const priceChanged = oldPrice == null || Math.abs(oldPrice - c.priceTon) > 1e-9;
      const reappeared = ex.status !== "active";
      await prisma.listing.update({
        where: { id: ex.id },
        data: {
          marketplace: c.marketplace,
          marketplaceUrl: marketUrl(c.marketplace, address, c.address),
          priceAmount: c.priceTon,
          priceUsdNet: priceUsd,
          status: "active",
          sellerAddress: c.sellerAddress,
          lastSeenScanId: scanId,
          ...(priceChanged ? { priceUpdatedAt: new Date() } : {}),
        },
      });
      if (reappeared) {
        nnew++;
        events.push({
          scanId,
          listingId: ex.id,
          nftItemId: c.nftItemId,
          collectionId,
          eventType: "reappeared",
          newPriceAmount: c.priceTon,
          newPriceUsdNet: priceUsd,
        });
      } else if (priceChanged && oldPrice != null) {
        nchanged++;
        events.push({
          scanId,
          listingId: ex.id,
          nftItemId: c.nftItemId,
          collectionId,
          eventType: c.priceTon > oldPrice ? "price_up" : "price_down",
          oldPriceAmount: oldPrice,
          newPriceAmount: c.priceTon,
          oldPriceUsdNet: ex.priceUsdNet != null ? Number(ex.priceUsdNet) : null,
          newPriceUsdNet: priceUsd,
          priceDeltaPct: ((c.priceTon - oldPrice) / oldPrice) * 100,
        });
      }
    }
  }

  // исчезнувшие active-листинги → sold / delisted (§3.1)
  const prevActive = existing
    .filter((l) => l.status === "active")
    .map((l) => ({
      nftItemId: l.nftItemId,
      priceTon: l.priceAmount != null ? Number(l.priceAmount) : null,
      sellerAddress: l.sellerAddress,
      isAuction: false,
    }));
  const { sales, delistedItemIds } = inferSales(prevActive, currentState);

  for (const s of sales) {
    ngone++;
    const ex = byItem.get(s.nftItemId);
    saleCreates.push({
      collectionId,
      nftItemId: s.nftItemId,
      currency: "TON",
      priceAmount: s.priceTon,
      priceUsdNet: s.priceTon != null ? grossUsd(s.priceTon) : null,
      seller: s.seller,
      buyer: s.buyer,
      soldAt: new Date(),
      source: "cross-scan-delta",
      confidence: "inferred",
      priceKind: s.priceKind,
      detectedScanId: scanId,
      prevScanId: ex?.lastSeenScanId ?? null,
    });
    events.push({
      scanId,
      listingId: ex?.id ?? null,
      nftItemId: s.nftItemId,
      collectionId,
      eventType: "sold",
      oldPriceAmount: s.priceTon,
      oldPriceUsdNet: s.priceTon != null ? grossUsd(s.priceTon) : null,
    });
    await prisma.listing.update({ where: { nftItemId: s.nftItemId }, data: { status: "sold", lastSeenScanId: scanId } });
  }
  for (const itemId of delistedItemIds) {
    ngone++;
    const ex = byItem.get(itemId);
    events.push({ scanId, listingId: ex?.id ?? null, nftItemId: itemId, collectionId, eventType: "delisted" });
    await prisma.listing.update({ where: { nftItemId: itemId }, data: { status: "delisted", lastSeenScanId: scanId } });
  }

  if (newListings.length) await prisma.listing.createMany({ data: newListings });
  if (saleCreates.length) await prisma.sale.createMany({ data: saleCreates, skipDuplicates: true });
  if (events.length) await prisma.listingEvent.createMany({ data: events });

  return { seen: currentListings.length, nnew, nchanged, ngone };
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
