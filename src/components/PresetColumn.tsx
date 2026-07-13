import { PackageOpen, WifiOff } from "lucide-react";
import { LotCard, type LotView } from "./LotCard";
import { backdropColor } from "@/lib/backdropColors";

export interface BackdropSection {
  backdropName: string;
  lots: LotView[];
}

// Колонка витрины = один пресет (Коллекция + Модель). Тело: секции по фонам (каждая — свои лоты) или
// degraded (все маркеты пресета недоступны).
export function PresetColumn({
  idx,
  model,
  collection,
  sections,
  degraded,
}: {
  idx: string;
  model: string;
  collection: string;
  sections: BackdropSection[];
  degraded: boolean;
}) {
  return (
    <div className="flex min-w-[320px] flex-col border-r border-outline-variant">
      <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low p-4">
        <div className="min-w-0">
          <div className="truncate text-label-md uppercase tracking-widest text-primary">{model}</div>
          <div className="truncate font-mono text-[10px] text-on-surface-variant">{collection}</div>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-on-surface-variant">IDX: {idx}</span>
      </div>

      {degraded ? (
        <div className="flex flex-grow items-center justify-center p-8 text-center">
          <div className="space-y-3">
            <WifiOff size={32} className="mx-auto text-error" />
            <p className="text-label-md uppercase tracking-widest text-on-surface-variant">Источник временно недоступен</p>
          </div>
        </div>
      ) : (
        <div className="flex-grow space-y-6 overflow-y-auto p-4">
          {sections.map((s) => (
            <section key={s.backdropName}>
              <div className="mb-3 flex items-center gap-2 border-b border-outline-variant pb-2">
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full border border-outline-variant"
                  style={{ backgroundColor: backdropColor(s.backdropName) }}
                  title={s.backdropName}
                />
                <span className="truncate text-label-md uppercase tracking-widest text-on-surface">{s.backdropName}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-on-surface-variant">{s.lots.length}</span>
              </div>
              {s.lots.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-4 text-center">
                  <PackageOpen size={16} className="text-outline" />
                  <p className="font-mono text-[11px] text-on-surface-variant">Нет активных лотов</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {s.lots.map((lot) => (
                    <LotCard key={lot.id} lot={lot} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
