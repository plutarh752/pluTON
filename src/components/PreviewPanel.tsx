import { GiftImage } from "./GiftImage";
import { formatBuyPriceParts } from "@/lib/format";
import { backdropColor, sortBackdropsDarkToLight } from "@/lib/backdropColors";

// Панель превью рядом с формой пресета: крупная картинка выбранной модели (из реального лота через
// Fragment CDN), floor коллекции (TON + ⭐/$) и образцы выбранных фонов. Нативный <select> картинки в
// options не рендерит — поэтому превью показываем здесь, после выбора коллекции/модели.
export function PreviewPanel({
  collection,
  model,
  imageUrl,
  floorTon,
  floorUsd,
  floorStars,
  backdrops,
  loading,
}: {
  collection: string;
  model: string;
  imageUrl: string | null;
  floorTon: number | null;
  floorUsd: number | null;
  floorStars: number | null;
  backdrops: string[];
  loading?: boolean;
}) {
  const floor = floorTon != null ? formatBuyPriceParts(floorTon, floorStars, floorUsd) : null;

  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
      <div className="relative mb-4 aspect-square w-full overflow-hidden rounded border border-outline-variant bg-surface-container-high">
        {loading ? (
          <div className="flex h-full w-full items-center justify-center font-mono text-[11px] text-on-surface-variant">
            Загрузка превью…
          </div>
        ) : (
          <GiftImage src={imageUrl} alt={model || collection} />
        )}
      </div>

      <div className="space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">
            {collection || "Коллекция"}
          </div>
          <div className="font-label-caps text-label-caps text-primary">{model || "— выбери модель —"}</div>
        </div>

        <div className="flex items-center justify-between border-t border-outline-variant pt-3">
          <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">Floor коллекции</span>
          {floor ? (
            <div className="text-right">
              <div className="font-mono text-body-md text-primary tabular-nums">{floor.ton} TON</div>
              <div className="font-mono text-[10px] text-on-surface-variant tabular-nums">
                {[floor.stars, floor.usd].filter(Boolean).join("  ·  ")}
              </div>
            </div>
          ) : (
            <span className="font-mono text-[11px] text-on-surface-variant">—</span>
          )}
        </div>

        {backdrops.length > 0 && (
          <div className="border-t border-outline-variant pt-3">
            <div className="mb-2 text-[10px] uppercase tracking-widest text-on-surface-variant">
              Фоны ({backdrops.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {sortBackdropsDarkToLight(backdrops).map((n) => (
                <span
                  key={n}
                  className="inline-flex items-center gap-1.5 rounded border border-outline-variant px-2 py-1"
                >
                  <span
                    className="h-3 w-3 rounded-full border border-outline-variant"
                    style={{ backgroundColor: backdropColor(n) }}
                  />
                  <span className="font-mono text-[10px] text-on-surface">{n}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
