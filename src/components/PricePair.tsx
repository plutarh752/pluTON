import { pricePairParts, type Currency } from "@/lib/format";

// Единственный способ показать цену в UI: валюта + $net (голых сумм нет нигде, бизнес-правило).
export function PricePair({
  amount,
  currency,
  usdNet,
  className = "",
}: {
  amount: number;
  currency: Currency;
  usdNet: number;
  className?: string;
}) {
  const p = pricePairParts(amount, currency, usdNet);
  return (
    <span className={`inline-flex items-baseline gap-1 tabular-nums ${className}`}>
      <span className="font-medium">
        {p.symbol} {p.amount}
      </span>
      <span className="text-xs text-neutral-500">({p.usdNet})</span>
    </span>
  );
}
