// PluTON v2: единственный форматтер цен — покупательская тройка TON + ⭐Stars + ~$ (gross).
// Это ASK-цена на ПОКУПКУ, поэтому $ = gross (цена × курс), БЕЗ net-семантики (комиссия продажи не при чём).
// Голых значений в UI нет: TON всегда в паре хотя бы с одним эквивалентом.

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

export interface Rates {
  ton_usd: number;
  stars_usd: number;
}

/** Валовый USD-эквивалент цены в TON (для покупателя). */
export function tonToUsd(priceTon: number, r: Rates): number {
  return priceTon * (r.ton_usd || 0);
}

/** Эквивалент цены в Telegram Stars: (TON → USD) / stars_usd. */
export function tonToStars(priceTon: number, r: Rates): number {
  if (!r.stars_usd) return 0;
  return (priceTon * (r.ton_usd || 0)) / r.stars_usd;
}

function fmtTon(n: number): string {
  // как в дизайне: всегда 2 знака (125.00, 140.20)
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtStars(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Отформатированные части покупательской цены. Принимает уже посчитанные raw-значения (снапшот прогона). */
export function formatBuyPriceParts(
  tonRaw: number,
  starsRaw: number | null | undefined,
  usdRaw: number | null | undefined
) {
  return {
    ton: fmtTon(tonRaw),
    stars: starsRaw != null ? `⭐ ${fmtStars(starsRaw)}` : null,
    usd: usdRaw != null ? `~$${fmtUsd(usdRaw)}` : null,
  };
}

/** Отформатировать `% отклонения от floor`: "-12.3%" / "+4.0%". */
export function formatFloorDeviation(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}
