// Чистая статистика + редкость атрибутов. Используется legacy-сканом (tonapi-каталог, вне пути витрины).
// PluTON v2: премия за редкость и Deal Score удалены (рынок floor-driven, продукт — трекер, не Deal Finder).

export interface Attribute {
  trait_type: string;
  value: string;
}

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
