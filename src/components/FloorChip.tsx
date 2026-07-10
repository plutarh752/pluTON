import { formatFloorDeviation } from "@/lib/format";

// Чип «% от floor коллекции»: зелёный если лот НИЖЕ floor (выгодно), красный если ВЫШЕ.
// pct = (priceTon - floorTon)/floorTon × 100. null → floor неизвестен, чип не рисуем.
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
      title="Отклонение от floor коллекции"
    >
      {formatFloorDeviation(pct)} floor
    </span>
  );
}
