// Пересчёт скоринга по данным из БД (без обращения к tonapi). Это и есть Settings «пересчёт»:
// при смене весов/курсов/порогов пересчитывает expected/undervaluation/liquidity/confidence/dealScore.
import "dotenv/config";
import { prisma } from "../src/lib/db";
import {
  chooseBasePrice,
  computeRarityRank,
  expectedPriceTon,
  undervaluationPct,
  grossUsd,
  netProceedsUsd,
  liquidityFactor,
  confidenceFactor,
  type Fees,
  type Weights,
  type Thresholds,
  type RarityMap,
  type Attribute,
} from "../src/lib/scoring";

async function loadSettings() {
  const rows = await prisma.setting.findMany();
  const s: Record<string, any> = {};
  for (const r of rows) s[r.key] = r.value;
  return s;
}

function chunk<T>(a: T[], n: number): T[][] {
  const o: T[][] = [];
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
  return o;
}

// Статус пересчёта в settings — чтобы кнопка «Пересчитать» в UI (и CLI-запуск) знали прогресс.
async function setState(v: object) {
  await prisma.setting.upsert({
    where: { key: "rescore_state" },
    create: { key: "rescore_state", value: v as object },
    update: { value: v as object },
  });
}

async function main() {
  const startedAt = new Date().toISOString();
  await setState({ status: "running", startedAt });
  let total = 0;
  const s = await loadSettings();
  const fees: Fees = {
    ton_usd: s.rates?.ton_usd ?? 1.78,
    getgems_sale_pct: s.fees?.getgems_sale_pct ?? 0.05,
    gas_ton_per_tx: s.fees?.gas_ton_per_tx ?? 0.1,
  };
  const weights: Weights = s.weights ?? { Model: 0.2, Backdrop: 0.5, Symbol: 0.3 };
  const thresholds: Thresholds = s.thresholds ?? { min_sales_7d: 10, min_sales_30d: 5, min_listings_for_p25: 5 };
  const since7 = new Date(Date.now() - 7 * 864e5);
  const since30 = new Date(Date.now() - 30 * 864e5);

  const cols = await prisma.collection.findMany();
  for (const col of cols) {
    const active = await prisma.listing.findMany({ where: { collectionId: col.id, status: "active" }, include: { nftItem: true } });
    if (active.length === 0) continue;

    const rar = await prisma.attributeRarity.findMany({ where: { collectionId: col.id } });
    const rarity: RarityMap = new Map();
    for (const r of rar) {
      if (!rarity.has(r.traitType)) rarity.set(r.traitType, new Map());
      rarity.get(r.traitType)!.set(r.value, { count: r.count, pct: r.rarityPct });
    }
    const rank = computeRarityRank(rarity);
    const sales7 = (
      await prisma.sale.findMany({ where: { collectionId: col.id, confidence: "inferred", soldAt: { gte: since7 }, priceAmount: { not: null } }, select: { priceAmount: true } })
    ).map((r) => Number(r.priceAmount));
    const sales30 = (
      await prisma.sale.findMany({ where: { collectionId: col.id, confidence: "inferred", soldAt: { gte: since30 }, priceAmount: { not: null } }, select: { priceAmount: true } })
    ).map((r) => Number(r.priceAmount));

    const activePrices = active.map((l) => Number(l.priceAmount));
    const { basePriceTon, source } = chooseBasePrice({ sales7, sales30, activeListings: activePrices }, thresholds);
    const nLiquidity = sales7.length;
    const nBaseSamples = source === "sales_7d" ? sales7.length : source === "sales_30d" ? sales30.length : activePrices.length;
    const liq = liquidityFactor(nLiquidity);
    const conf = confidenceFactor(nBaseSamples);

    const rows = active.map((l) => {
      const priceTon = Number(l.priceAmount);
      const listNet = grossUsd(priceTon, fees);
      if (basePriceTon == null) {
        return { id: l.id, pusd: listNet, eamt: null, eusd: null, undv: null, liq, conf, ds: null, src: "insufficient_data" };
      }
      const attrs = (l.nftItem.attributes as Attribute[] | null) ?? [];
      const eTon = expectedPriceTon(attrs, rank, basePriceTon, weights);
      const eNet = netProceedsUsd(eTon, fees);
      const undv = undervaluationPct(eNet, listNet);
      return { id: l.id, pusd: listNet, eamt: eTon, eusd: eNet, undv, liq, conf, ds: undv * liq * 1 * conf, src: source };
    });

    for (const part of chunk(rows, 1000)) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Listing" AS l SET
           "priceUsdNet"=v.pusd,"expectedPriceAmount"=v.eamt,"expectedPriceUsdNet"=v.eusd,
           "undervaluationPct"=v.undv,"liquidityFactor"=v.liq,"confidence"=v.conf,
           "dealScore"=v.ds,"basePriceSource"=v.src::"BasePriceSource"
         FROM json_to_recordset($1::json)
           AS v(id int, pusd numeric, eamt numeric, eusd numeric, undv double precision,
                 liq double precision, conf double precision, ds double precision, src text)
         WHERE l.id = v.id`,
        JSON.stringify(part)
      );
    }
    total += rows.length;
    console.log(`rescored ${col.name}: ${rows.length} listings | base=${source} liq=${liq.toFixed(2)} conf=${conf.toFixed(2)}`);
  }
  await setState({ status: "success", startedAt, finishedAt: new Date().toISOString(), totalListings: total, collections: cols.length });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    await setState({ status: "failed", finishedAt: new Date().toISOString(), error: String(e) }).catch(() => {});
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
