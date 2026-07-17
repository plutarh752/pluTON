import { PackageOpen, WifiOff } from "lucide-react";
import { LotCard, type LotView } from "./LotCard";
import { GiftImage } from "./GiftImage";
import { revealStyle } from "@/lib/reveal";

// Форма "лоты, сгруппированные по фону" — строится на сервере (page.tsx) и разворачивается в плоский
// список в Showcase.tsx перед сортировкой (см. коммент там). Секции сами по себе больше НЕ рендерятся —
// сортировка по цене должна работать по всей колонке разом, а не сбрасываться на каждом новом фоне.
export interface BackdropSection {
  backdropName: string;
  lots: LotView[];
}

// Колонка витрины = один пресет (Коллекция + Модель). Тело: один список лотов (сортировка/фильтр — в
// Showcase.tsx, фон каждого лота — бейджем на самой карточке) или degraded (все маркеты пресета недоступны).
export function PresetColumn({
  idx,
  model,
  collection,
  imageUrl,
  lots,
  degraded,
}: {
  idx: string;
  model: string;
  collection: string;
  imageUrl?: string | null;
  lots: LotView[];
  degraded: boolean;
}) {
  return (
    <div className="flex min-w-[320px] flex-col border-r border-outline-variant">
      <div className="flex items-center justify-between gap-3 border-b border-outline-variant bg-surface-container-low p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded border border-outline-variant bg-surface-container-high">
            <GiftImage src={imageUrl ?? null} alt={model} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-label-md uppercase tracking-widest text-primary">{model}</div>
            <div className="truncate font-mono text-[10px] text-on-surface-variant">{collection}</div>
          </div>
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
      ) : lots.length === 0 ? (
        <div className="flex flex-grow items-center justify-center gap-2 p-8 text-center">
          <PackageOpen size={16} className="text-outline" />
          <p className="font-mono text-[11px] text-on-surface-variant">Нет активных лотов</p>
        </div>
      ) : (
        <div className="flex-grow space-y-4 overflow-y-auto p-4">
          {lots.map((lot, i) => (
            <div key={lot.id} className="reveal" style={revealStyle(i)}>
              <LotCard lot={lot} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
