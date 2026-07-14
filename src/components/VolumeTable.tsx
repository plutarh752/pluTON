"use client";

import { TriangleAlert } from "lucide-react";
import { GiftImage } from "./GiftImage";
import { LotPrice } from "./LotPrice";
import { collectionMarketLinks } from "@/lib/marketLinks";

// Таблица вкладки «Объёмы» (read-only, данные из последнего прогона Portals). Колонки: картинка, название,
// floor (TON+$), объём (TON+$), последняя продажа, топ-3 модели, ссылки на маркеты. Сорт по объёму убыв.
// уже сделан на сервере. Per-row бейдж неполноты — только у строк с isPartial=true (НЕ общий над таблицей).
export interface VolumeRow {
  collectionName: string;
  imageUrl: string | null;
  floorTon: number | null;
  floorUsd: number | null;
  volumeTon: number;
  volumeUsd: number | null;
  salesCount: number | null;
  lastSaleAt: string | null; // ISO
  topModels: string[];
  isPartial: boolean;
  blockchainAddress: string | null;
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 60) return "только что";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} ч назад`;
  const d = Math.round(hr / 24);
  return `${d} дн назад`;
}

export function VolumeTable({ rows }: { rows: VolumeRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-outline-variant text-left font-mono text-[10px] uppercase tracking-widest text-on-surface-variant">
            <th className="px-3 py-3 font-medium">#</th>
            <th className="px-3 py-3 font-medium">Коллекция</th>
            <th className="px-3 py-3 text-right font-medium">Floor</th>
            <th className="px-3 py-3 text-right font-medium">Объём</th>
            <th className="px-3 py-3 text-right font-medium">Посл. продажа</th>
            <th className="px-3 py-3 font-medium">Топ-3 модели</th>
            <th className="px-3 py-3 font-medium">Маркеты</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const links = collectionMarketLinks({
              collectionName: r.collectionName,
              blockchainAddress: r.blockchainAddress,
            });
            return (
              <tr
                key={r.collectionName}
                className="border-b border-outline-variant/60 transition-colors hover:bg-surface-container-low"
              >
                <td className="px-3 py-3 font-mono text-xs text-on-surface-variant tabular-nums">
                  {String(i + 1).padStart(3, "0")}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-outline-variant bg-surface-container-high">
                      <GiftImage src={r.imageUrl} alt={r.collectionName} />
                    </div>
                    <span className="font-medium text-on-surface">{r.collectionName}</span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  {r.floorTon != null ? (
                    <LotPrice ton={r.floorTon} stars={null} usd={r.floorUsd} />
                  ) : (
                    <span className="block text-right text-on-surface-variant">—</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-start justify-end gap-1.5">
                    {r.isPartial && (
                      <span
                        title="неполные данные — не хватило глубины истории"
                        className="mt-1 text-amber-500"
                      >
                        <TriangleAlert size={14} />
                      </span>
                    )}
                    <LotPrice ton={r.volumeTon} stars={null} usd={r.volumeUsd} />
                  </div>
                  {r.salesCount != null && (
                    <div className="mt-0.5 text-right font-mono text-[10px] text-on-surface-variant">
                      {r.salesCount} прод.
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-right font-mono text-xs text-on-surface-variant">
                  {relTime(r.lastSaleAt)}
                </td>
                <td className="px-3 py-3">
                  {r.topModels.length ? (
                    <span className="text-xs text-on-surface-variant">{r.topModels.join(", ")}</span>
                  ) : (
                    <span className="text-on-surface-variant">—</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    {links.map((l) => (
                      <a
                        key={l.label}
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded border border-outline-variant px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
                      >
                        {l.label}
                      </a>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
