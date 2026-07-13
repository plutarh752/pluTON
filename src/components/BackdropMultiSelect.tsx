"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { backdropColor, sortBackdropsDarkToLight } from "@/lib/backdropColors";

// Кастомный мультивыбор фонов с цветными образцами (нативный <select> не рендерит образцы/чекбоксы).
// Список отсортирован тёмный→светлый; каждая строка = кружок реального цвета + имя + rarity + отметка.
interface Attr {
  name: string;
  rarityPermille?: number;
}

export function BackdropMultiSelect({
  options,
  selected,
  onChange,
  disabled,
  placeholder = "Фоны",
}: {
  options: Attr[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  // закрытие по клику снаружи / Esc
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

  const sorted = useMemo(() => {
    const byName = new Map(options.map((o) => [o.name, o]));
    return sortBackdropsDarkToLight(options.map((o) => o.name)).map((name) => byName.get(name)!);
  }, [options]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sorted.filter((o) => o.name.toLowerCase().includes(q)) : sorted;
  }, [sorted, query]);

  const selectedSorted = useMemo(() => sortBackdropsDarkToLight(selected), [selected]);

  function toggle(name: string) {
    onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        aria-label="Фоны"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-6 py-4 font-label-caps text-label-caps text-on-surface focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {selected.length === 0 ? (
          <span className="text-on-surface-variant">{placeholder}</span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="flex -space-x-1">
              {selectedSorted.slice(0, 5).map((n) => (
                <span
                  key={n}
                  className="h-3.5 w-3.5 rounded-full border border-surface"
                  style={{ backgroundColor: backdropColor(n) }}
                />
              ))}
            </span>
            <span className="tabular-nums">{selected.length} фон(ов)</span>
          </span>
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
              placeholder="Поиск фона…"
              className="w-full bg-transparent px-2 py-1 font-mono text-[12px] text-on-surface placeholder:text-on-surface-variant focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 font-mono text-[11px] text-on-surface-variant">Ничего не найдено</div>
            ) : (
              filtered.map((o) => {
                const isSel = selected.includes(o.name);
                return (
                  <button
                    type="button"
                    key={o.name}
                    onClick={() => toggle(o.name)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-container-high"
                  >
                    <span
                      className="h-4 w-4 shrink-0 rounded-full border border-outline-variant"
                      style={{ backgroundColor: backdropColor(o.name) }}
                    />
                    <span className="flex-1 truncate font-label-caps text-label-caps text-on-surface">{o.name}</span>
                    {o.rarityPermille != null && (
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-on-surface-variant">
                        {(o.rarityPermille / 10).toLocaleString("en-US", { maximumFractionDigits: 1 })}%
                      </span>
                    )}
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        isSel ? "border-primary bg-primary text-on-primary" : "border-outline-variant"
                      }`}
                    >
                      {isSel && <Check size={12} />}
                    </span>
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
