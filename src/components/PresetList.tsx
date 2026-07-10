"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export interface PresetRow {
  id: number;
  collectionName: string;
  modelName: string;
  backdropName: string;
  previewImageUrl: string | null;
}

// Список сохранённых пресетов (строки как в Stitch-экране 1). Крестик → DELETE /api/presets/:id → refresh.
// STATUS ACTIVE/STANDBY — косметика: ACTIVE если по пресету есть лоты в последнем прогоне.
export function PresetList({ presets, activeMap }: { presets: PresetRow[]; activeMap: Record<number, number> }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<number | null>(null);

  async function remove(id: number) {
    setDeleting(id);
    try {
      await fetch(`/api/presets/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setDeleting(null);
    }
  }

  if (presets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest p-10 text-center">
        <p className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant">
          Пока нет сохранённых комбинаций
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <h2 className="font-label-caps text-label-caps uppercase tracking-[0.2em] text-on-surface-variant">
          Сохранённые комбинации ({presets.length})
        </h2>
        <span className="font-mono text-[11px] text-outline">Sorted by: Order</span>
      </div>

      {presets.map((p) => {
        const active = (activeMap[p.id] ?? 0) > 0;
        return (
          <div
            key={p.id}
            className="group flex items-center gap-6 rounded-lg border border-outline-variant bg-surface-container-lowest p-4 transition-colors hover:border-outline"
          >
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded border border-outline-variant bg-surface-container-high">
              {p.previewImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.previewImageUrl} alt="" className="h-full w-full object-cover grayscale transition-all group-hover:grayscale-0" />
              ) : null}
            </div>

            <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Коллекция" value={p.collectionName} />
              <Field label="Модель" value={p.modelName} />
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-widest text-on-surface-variant">Фон</div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-surface-dim" />
                  <span className="font-label-caps text-label-caps text-primary">{p.backdropName}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden text-right sm:block">
                <div className="mb-1 text-[10px] uppercase tracking-widest text-on-surface-variant">Status</div>
                <div className="font-mono text-[11px] text-primary">{active ? "ACTIVE" : "STANDBY"}</div>
              </div>
              <button
                onClick={() => remove(p.id)}
                disabled={deleting === p.id}
                aria-label="Удалить пресет"
                className="rounded p-2 text-on-surface-variant transition-colors hover:text-error disabled:opacity-40"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-widest text-on-surface-variant">{label}</div>
      <div className="font-label-caps text-label-caps text-primary">{value}</div>
    </div>
  );
}
