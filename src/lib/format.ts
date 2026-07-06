// Бизнес-правило: цена ВСЕГДА показывается парой «валюта + $net». Голых сумм нет нигде.
// Единственный форматтер цен в приложении — использовать только его.

export type Currency = "TON" | "STARS";

const SYMBOL: Record<Currency, string> = {
  TON: "💎",
  STARS: "⭐",
};

function fmtAmount(n: number): string {
  // без лишних дробей: 5100, 7.9, 17.35
  if (Number.isInteger(n)) return n.toLocaleString("en-US");
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

/**
 * Пара «валюта + чистый USD». Пример: "💎 5100 (~$9,078.00 net)".
 * usdNet должен приходить уже посчитанным на бэке (после комиссий/конвертации).
 */
export function formatPricePair(amount: number, currency: Currency, usdNet: number): string {
  return `${SYMBOL[currency]} ${fmtAmount(amount)} (~$${fmtUsd(usdNet)} net)`;
}

/** Структурированный вариант — для компонента PricePair, когда нужны части отдельно. */
export function pricePairParts(amount: number, currency: Currency, usdNet: number) {
  return {
    symbol: SYMBOL[currency],
    amount: fmtAmount(amount),
    usdNet: `$${fmtUsd(usdNet)} net`,
  };
}
