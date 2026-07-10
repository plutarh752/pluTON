import { PackageOpen, WifiOff } from "lucide-react";
import { LotCard, type LotView } from "./LotCard";

// Колонка витрины = один пресет. Три состояния тела: лоты / пусто / degraded (источник недоступен).
export function PresetColumn({
  idx,
  model,
  backdrop,
  lots,
  degraded,
}: {
  idx: string;
  model: string;
  backdrop: string;
  lots: LotView[];
  degraded: boolean;
}) {
  return (
    <div className="flex min-w-[320px] flex-col border-r border-outline-variant">
      <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low p-4">
        <span className="text-label-md uppercase tracking-widest text-primary">
          {model} / {backdrop}
        </span>
        <span className="font-mono text-[10px] text-on-surface-variant">IDX: {idx}</span>
      </div>

      {degraded ? (
        <div className="flex flex-grow items-center justify-center p-8 text-center">
          <div className="space-y-3">
            <WifiOff size={32} className="mx-auto text-error" />
            <p className="text-label-md uppercase tracking-widest text-on-surface-variant">Источник временно недоступен</p>
          </div>
        </div>
      ) : lots.length === 0 ? (
        <div className="flex flex-grow items-center justify-center p-8 text-center">
          <div className="space-y-3">
            <PackageOpen size={32} className="mx-auto text-outline" />
            <p className="text-label-md uppercase tracking-widest text-on-surface-variant">Нет активных лотов</p>
          </div>
        </div>
      ) : (
        <div className="flex-grow space-y-4 overflow-y-auto p-4">
          {lots.map((lot) => (
            <LotCard key={lot.id} lot={lot} />
          ))}
        </div>
      )}
    </div>
  );
}
