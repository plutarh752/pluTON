import { formatBuyPriceParts } from "@/lib/format";

// Покупательская тройка цены лота: TON (крупно) + ⭐Stars + ~$ (gross). Голых значений в UI нет —
// TON всегда в паре хотя бы с одним эквивалентом. Значения приходят посчитанными из снапшота прогона.
export function LotPrice({
  ton,
  stars,
  usd,
  className = "",
}: {
  ton: number;
  stars: number | null;
  usd: number | null;
  className?: string;
}) {
  const p = formatBuyPriceParts(ton, stars, usd);
  return (
    <div className={`flex flex-col items-end gap-0.5 ${className}`}>
      <span className="font-headline-md text-headline-md text-primary tabular-nums">
        {p.ton} <span className="text-sm">TON</span>
      </span>
      <span className="font-mono text-[11px] text-on-surface-variant tabular-nums">
        {[p.stars, p.usd].filter(Boolean).join("  ·  ")}
      </span>
    </div>
  );
}
