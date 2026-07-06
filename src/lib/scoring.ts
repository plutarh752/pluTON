// Чистая логика скоринга (используется и воркером, и API). Формулы — план §4 / §3.1.
// Всё в TON; конвертация в $net — отдельными функциями (комиссии/газ из settings).

export interface Attribute {
  trait_type: string;
  value: string;
}

export interface Weights {
  [traitType: string]: number;
}

export interface Fees {
  ton_usd: number;
  getgems_sale_pct: number; // 0.05
  gas_ton_per_tx: number; // 0.1
}

export interface Thresholds {
  min_sales_7d: number;
  min_sales_30d: number;
  min_listings_for_p25: number;
}

export type BasePriceSource = "sales_7d" | "sales_30d" | "listings_p25" | "insufficient_data";

// ── статистика ──
export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[idx];
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// ── редкость ──
// rarity_pct = count(value) / N_items * 100. Оси берём динамически из данных.
export type RarityMap = Map<string, Map<string, { count: number; pct: number }>>;

export function computeRarity(itemAttributes: Attribute[][], nItems: number): RarityMap {
  const map: RarityMap = new Map();
  for (const attrs of itemAttributes) {
    for (const a of attrs) {
      if (!map.has(a.trait_type)) map.set(a.trait_type, new Map());
      const axis = map.get(a.trait_type)!;
      const cur = axis.get(a.value)?.count ?? 0;
      axis.set(a.value, { count: cur + 1, pct: 0 });
    }
  }
  const denom = nItems || 1;
  for (const axis of map.values()) {
    for (const entry of axis.values()) entry.pct = (entry.count / denom) * 100;
  }
  return map;
}

export function rarityPct(rarity: RarityMap, traitType: string, value: string): number | undefined {
  return rarity.get(traitType)?.get(value)?.pct;
}

// Ранг редкости ОТНОСИТЕЛЬНО оси: s = доля предметов на оси со СТРОГО более частым значением.
// Самый частый → 0, медианный → ~0.5, редчайший → ~1. Чинит и плоскость, и overshoot
// (обычный предмет ≈ base, а не ×5) на осях с высокой кардинальностью (Symbol = 280 значений).
export type RankMap = Map<string, Map<string, number>>;

export function computeRarityRank(rarity: RarityMap): RankMap {
  const rank: RankMap = new Map();
  for (const [axis, values] of rarity) {
    const entries = [...values.entries()];
    const N = entries.reduce((a, [, e]) => a + e.count, 0) || 1;
    const m = new Map<string, number>();
    for (const [value, { count }] of entries) {
      let moreCommon = 0;
      for (const [, e2] of entries) if (e2.count > count) moreCommon += e2.count;
      m.set(value, moreCommon / N);
    }
    rank.set(axis, m);
  }
  return rank;
}

// ── конвертация в USD ──
export function grossUsd(amountTon: number, fees: Fees): number {
  return amountTon * fees.ton_usd;
}

/** Чистые поступления в USD, если ПРОДАТЬ по цене amountTon (минус комиссия и газ). */
export function netProceedsUsd(amountTon: number, fees: Fees): number {
  return (amountTon * (1 - fees.getgems_sale_pct) - fees.gas_ton_per_tx) * fees.ton_usd;
}

// ── expected price ──
export function chooseBasePrice(
  input: { sales7: number[]; sales30: number[]; activeListings: number[] },
  t: Thresholds
): { basePriceTon: number | null; source: BasePriceSource } {
  if (input.sales7.length >= t.min_sales_7d) return { basePriceTon: median(input.sales7), source: "sales_7d" };
  if (input.sales30.length >= t.min_sales_30d) return { basePriceTon: median(input.sales30), source: "sales_30d" };
  if (input.activeListings.length >= t.min_listings_for_p25)
    return { basePriceTon: percentile(input.activeListings, 25), source: "listings_p25" };
  return { basePriceTon: null, source: "insufficient_data" };
}

/** expected_price = base * (1 + Σ w_i * s_i), где s_i — ранг редкости атрибута в оси (0..1).
 *  Веса в сумме ~1 → premium ∈ [0, ~Σw]: обычный ≈ base, редчайший ≈ (1+Σw)×base. В рынке, без взрыва. */
export function expectedPriceTon(
  attributes: Attribute[],
  rank: RankMap,
  basePriceTon: number,
  weights: Weights
): number {
  let premium = 0;
  for (const a of attributes) {
    const s = rank.get(a.trait_type)?.get(a.value);
    const w = weights[a.trait_type];
    if (s != null && w) premium += w * s;
  }
  return basePriceTon * (1 + premium);
}

// ── факторы Deal Score ──
export function undervaluationPct(expectedNet: number, listingNet: number): number {
  if (expectedNet <= 0) return 0;
  return clamp((expectedNet - listingNet) / expectedNet, -1, 1);
}

/** Ликвидность из inferred-продаж за 7д (НИЖНЯЯ оценка, §3.1). Насыщающаяся нормализация с полом,
 *  чтобы cold-start (ещё нет истории продаж) не обнулял весь Deal Score. */
export function liquidityFactor(nInferredSales7d: number, tau = 5, floor = 0.2): number {
  return floor + (1 - floor) * (1 - Math.exp(-nInferredSales7d / tau));
}

/** Штраф за застой цены (пока заглушка = 1; TODO: относительно движения рынка, не чистый возраст). */
export function freshnessFactor(_priceStalenessDays: number | null): number {
  return 1;
}

/** Доверие к expected_price по размеру выборки, на которой построена base_price
 *  (число продаж, если база из продаж; число активных листингов, если база из p25). */
export function confidenceFactor(nBaseSamples: number, tau = 8): number {
  return 1 - Math.exp(-nBaseSamples / tau);
}

export interface DealScoreInput {
  expectedNet: number;
  listingNet: number;
  nInferredSales7d: number;
  nBaseSamples: number;
  priceStalenessDays: number | null;
}

export function dealScore(i: DealScoreInput): {
  dealScore: number;
  undervaluationPct: number;
  liquidityFactor: number;
  freshnessFactor: number;
  confidence: number;
} {
  const u = undervaluationPct(i.expectedNet, i.listingNet);
  const l = liquidityFactor(i.nInferredSales7d);
  const f = freshnessFactor(i.priceStalenessDays);
  const c = confidenceFactor(i.nBaseSamples);
  return {
    dealScore: u * l * f * c,
    undervaluationPct: u,
    liquidityFactor: l,
    freshnessFactor: f,
    confidence: c,
  };
}
