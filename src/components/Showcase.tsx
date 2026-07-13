"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import { PresetColumn, type BackdropSection } from "./PresetColumn";
import { MARKETS, marketLabel, type Market } from "@/lib/markets";

// Данные одной колонки витрины (сериализуемо, строится на сервере в page.tsx).
export interface ColumnData {
  id: number;
  idx: string;
  model: string;
  collection: string;
  imageUrl?: string | null;
  degraded: boolean;
  sections: BackdropSection[];
}

type SortDir = "asc" | "desc";
const STORAGE_KEY = "pluton:showcase-filter:v1";

// Дефолт совпадает с текущим поведением витрины (все площадки, цена по возрастанию) → нет hydration mismatch.
const DEFAULT_ENABLED = MARKETS.reduce(
  (acc, m) => ({ ...acc, [m]: true }),
  {} as Record<Market, boolean>,
);

// Клиентская обёртка сетки колонок: глобальная панель «Фильтр» (сортировка по цене + выбор площадок),
// применяется одинаково ко всем колонкам/секциям сразу. Выбор помнится в localStorage.
export function Showcase({ columns }: { columns: ColumnData[] }) {
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [enabled, setEnabled] = useState<Record<Market, boolean>>(DEFAULT_ENABLED);
  const [open, setOpen] = useState(false);
  // ready=false до чтения localStorage → первый persist пропускаем, чтобы дефолты не затёрли сохранённое.
  const [ready, setReady] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Гидрация из localStorage после монтирования (не в useState-инициализаторе — иначе SSR-mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { sortDir?: unknown; enabled?: Record<string, unknown> };
        if (saved.sortDir === "asc" || saved.sortDir === "desc") setSortDir(saved.sortDir);
        if (saved.enabled && typeof saved.enabled === "object") {
          setEnabled((prev) => {
            const next = { ...prev };
            for (const m of MARKETS) if (typeof saved.enabled![m] === "boolean") next[m] = saved.enabled![m] as boolean;
            return next;
          });
        }
      }
    } catch {
      /* повреждённое хранилище — игнорируем, остаёмся на дефолтах */
    }
    setReady(true);
  }, []);

  // Персист при изменении (после гидрации). ready-гейт исключает затирание сохранённого на первом рендере.
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ sortDir, enabled }));
    } catch {
      /* приватный режим / переполнение — тихо игнорируем */
    }
  }, [ready, sortDir, enabled]);

  // Закрытие поповера по клику снаружи / Esc (паттерн из BackdropMultiSelect).
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

  const enabledCount = MARKETS.filter((m) => enabled[m]).length;

  // Применяем фильтр площадок + сортировку по цене к лотам КАЖДОЙ секции КАЖДОЙ колонки одинаково.
  const derived = useMemo(
    () =>
      columns.map((c) => ({
        ...c,
        sections: c.sections.map((s) => ({
          ...s,
          lots: s.lots
            .filter((l) => enabled[l.market as Market] ?? true)
            .slice()
            .sort((a, b) => (sortDir === "asc" ? a.priceTon - b.priceTon : b.priceTon - a.priceTon)),
        })),
      })),
    [columns, enabled, sortDir],
  );

  function toggleMarket(m: Market) {
    setEnabled((prev) => ({ ...prev, [m]: !prev[m] }));
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b border-outline-variant bg-surface-container-low px-margin-mobile py-3 md:px-margin-desktop">
        <div className="relative" ref={wrapRef}>
          <button
            type="button"
            aria-label="Фильтр"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2 rounded border border-outline-variant bg-surface px-4 py-2 text-label-md uppercase tracking-widest text-on-surface transition-colors hover:border-outline"
          >
            <SlidersHorizontal size={16} className="text-on-surface-variant" />
            Фильтр
            <span className="ml-1 font-mono text-[10px] tabular-nums text-on-surface-variant">
              TON {sortDir === "asc" ? "↑" : "↓"} · {enabledCount}/{MARKETS.length}
            </span>
            <ChevronDown size={14} className={`text-on-surface-variant transition-transform ${open ? "rotate-180" : ""}`} />
          </button>

          {open && (
            <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-outline-variant bg-surface-container-lowest p-3 shadow-lg">
              <div className="mb-3">
                <div className="mb-2 text-label-md uppercase tracking-widest text-on-surface-variant">Сортировка по цене</div>
                <div className="grid grid-cols-2 gap-1">
                  {(["asc", "desc"] as SortDir[]).map((dir) => {
                    const active = sortDir === dir;
                    return (
                      <button
                        key={dir}
                        type="button"
                        onClick={() => setSortDir(dir)}
                        className={`flex items-center justify-center gap-1.5 rounded border px-2 py-2 font-mono text-[11px] transition-colors ${
                          active
                            ? "border-primary bg-primary text-on-primary"
                            : "border-outline-variant text-on-surface hover:bg-surface-container-high"
                        }`}
                      >
                        {dir === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
                        {dir === "asc" ? "по возр." : "по убыв."}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 text-label-md uppercase tracking-widest text-on-surface-variant">Площадки</div>
                <div className="space-y-0.5">
                  {MARKETS.map((m) => {
                    const on = enabled[m];
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => toggleMarket(m)}
                        className="flex w-full items-center gap-3 rounded px-2 py-2 text-left transition-colors hover:bg-surface-container-high"
                      >
                        <span className="flex-1 truncate font-label-caps text-label-caps text-on-surface">{marketLabel(m)}</span>
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            on ? "border-primary bg-primary text-on-primary" : "border-outline-variant"
                          }`}
                        >
                          {on && <Check size={12} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <section className="no-scrollbar flex flex-grow overflow-x-auto overflow-y-hidden bg-surface-container-lowest">
        {derived.map((c) => (
          <PresetColumn
            key={c.id}
            idx={c.idx}
            model={c.model}
            collection={c.collection}
            imageUrl={c.imageUrl}
            sections={c.sections}
            degraded={c.degraded}
          />
        ))}
      </section>
    </>
  );
}
