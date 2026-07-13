"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { GiftImage } from "./GiftImage";
import { formatBuyPriceParts, tonToStars, tonToUsd, type Rates } from "@/lib/format";

// Кастомный dropdown «Модель»: строка = миниатюра + имя + мин.цена (TON + ⭐/$). Нативный <select>
// картинки не рендерит. Картинка — чистый арт модели из changes.tg (детерминированный URL, есть у КАЖДОЙ
// модели). Мин.цена — из /api/model-previews (батч по коллекции); модели вне cheapest-50 показываем БЕЗ
// цены, но С картинкой (graceful).
interface Named {
  name: string;
}
export interface ModelPreviewView {
  imageUrl: string | null;
  minPriceTon?: number;
}

function MinPrice({ ton, rates }: { ton: number; rates: Rates }) {
  const p = formatBuyPriceParts(ton, tonToStars(ton, rates), tonToUsd(ton, rates));
  return (
    <div className="text-right leading-tight">
      <div className="font-mono text-[11px] text-primary tabular-nums">{p.ton} TON мин.</div>
      <div className="font-mono text-[9px] text-on-surface-variant tabular-nums">
        {[p.stars, p.usd].filter(Boolean).join(" · ")}
      </div>
    </div>
  );
}

export function ModelSelect({
  options,
  selected,
  onChange,
  previews,
  rates,
  disabled,
  loading,
  placeholder = "Модель",
}: {
  options: Named[];
  selected: string;
  onChange: (name: string) => void;
  previews: Record<string, ModelPreviewView>;
  rates: Rates;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const selectedPreview = selected ? previews[selected] : undefined;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        aria-label="Модель"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-6 py-4 font-label-caps text-label-caps text-on-surface focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <span className="relative h-6 w-6 shrink-0 overflow-hidden rounded border border-outline-variant bg-surface-container-high">
              <GiftImage src={selectedPreview?.imageUrl ?? null} alt={selected} />
            </span>
            <span className="truncate">{selected}</span>
          </span>
        ) : (
          <span className="text-on-surface-variant">{loading ? "Загрузка…" : placeholder}</span>
        )}
        <ChevronDown size={16} className="ml-auto shrink-0 text-on-surface-variant" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest shadow-lg">
          <div className="border-b border-outline-variant p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск модели…"
              className="w-full bg-transparent px-2 py-1 font-mono text-[12px] text-on-surface placeholder:text-on-surface-variant focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 font-mono text-[11px] text-on-surface-variant">
                {loading ? "Загрузка…" : "Ничего не найдено"}
              </div>
            ) : (
              filtered.map((o) => {
                const pv = previews[o.name];
                const isSel = o.name === selected;
                return (
                  <button
                    type="button"
                    key={o.name}
                    onClick={() => {
                      onChange(o.name);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-container-high ${
                      isSel ? "bg-surface-container-high" : ""
                    }`}
                  >
                    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded border border-outline-variant bg-surface-container-high">
                      <GiftImage src={pv?.imageUrl ?? null} alt={o.name} />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-label-caps text-label-caps text-on-surface">
                      {o.name}
                    </span>
                    {pv?.minPriceTon != null ? (
                      <MinPrice ton={pv.minPriceTon} rates={rates} />
                    ) : (
                      <span className="shrink-0 font-mono text-[10px] text-outline">—</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
