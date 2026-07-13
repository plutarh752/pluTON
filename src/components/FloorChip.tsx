import { formatFloorMultiple } from "@/lib/format";

// Чип «× к floor коллекции»: множитель цены к floor (1.24×, 0.88×). Зелёный если лот НИЖЕ floor
// (<1×, выгодно), красный если ВЫШЕ (>1×). pct = (priceTon - floorTon)/floorTon × 100; множитель = 1 + pct/100.
// null → floor неизвестен, чип не рисуем.
export function FloorChip({ pct, className = "" }: { pct: number | null; className?: string }) {
  if (pct == null || Number.isNaN(pct)) return null;
  const below = pct < 0;
  const tone = below
    ? "border-emerald-600/40 text-emerald-700 dark:text-emerald-400"
    : pct > 0
      ? "border-red-600/40 text-red-700 dark:text-red-400"
      : "border-outline-variant text-on-surface-variant";
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${tone} ${className}`}
      title="Множитель цены к floor коллекции"
    >
      {formatFloorMultiple(pct)} floor
    </span>
  );
}
