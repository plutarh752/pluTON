"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ChevronDown } from "lucide-react";
import { GiftImage } from "./GiftImage";
import { formatBuyPriceParts, tonToStars, tonToUsd, type Rates } from "@/lib/format";

// Кастомный dropdown «Коллекция»: имя + floor-цена показываются СРАЗУ (floor приходит из /api/collections
// одним запросом), а миниатюра догружается ЛЕНИВО, когда строка попадает во вьюпорт списка
// (IntersectionObserver → /api/collection-thumb, кэш неделя). До загрузки/при промахе — плейсхолдер.
interface Named {
  name: string;
}

// Модульный кэш миниатюр (в пределах сессии) — не перезапрашиваем при повторном открытии поповера.
const thumbCache = new Map<string, string | null>();

function FloorPrice({ ton, rates }: { ton: number; rates: Rates }) {
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

function CollectionRow({
  name,
  floorTon,
  rates,
  isSel,
  onSelect,
  rootRef,
}: {
  name: string;
  floorTon: number | undefined;
  rates: Rates;
  isSel: boolean;
  onSelect: () => void;
  rootRef: RefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [img, setImg] = useState<string | null | undefined>(
    thumbCache.has(name) ? thumbCache.get(name) : undefined
  );

  useEffect(() => {
    if (thumbCache.has(name)) return; // уже знаем результат
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          fetch(`/api/collection-thumb?collection=${encodeURIComponent(name)}`)
            .then((r) => r.json())
            .then((d) => {
              const u = (d.imageUrl ?? null) as string | null;
              thumbCache.set(name, u);
              setImg(u);
            })
            .catch(() => {
              thumbCache.set(name, null);
              setImg(null);
            });
        }
      },
      { root: rootRef.current, rootMargin: "120px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [name, rootRef]);

  return (
    <button
      type="button"
      ref={ref}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-container-high ${
        isSel ? "bg-surface-container-high" : ""
      }`}
    >
      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded border border-outline-variant bg-surface-container-high">
        <GiftImage src={img ?? null} alt={name} />
      </span>
      <span className="min-w-0 flex-1 truncate font-label-caps text-label-caps text-on-surface">{name}</span>
      {floorTon != null ? (
        <FloorPrice ton={floorTon} rates={rates} />
      ) : (
        <span className="shrink-0 font-mono text-[10px] text-outline">—</span>
      )}
    </button>
  );
}

export function CollectionSelect({
  options,
  floors,
  rates,
  selected,
  onChange,
  disabled,
  placeholder = "Коллекция",
}: {
  options: Named[];
  floors: Record<string, number>;
  rates: Rates;
  selected: string;
  onChange: (name: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        aria-label="Коллекция"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-6 py-4 font-label-caps text-label-caps text-on-surface focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {selected ? (
          <span className="truncate">{selected}</span>
        ) : (
          <span className="text-on-surface-variant">{placeholder}</span>
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
              placeholder="Поиск коллекции…"
              className="w-full bg-transparent px-2 py-1 font-mono text-[12px] text-on-surface placeholder:text-on-surface-variant focus:outline-none"
            />
          </div>
          <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 font-mono text-[11px] text-on-surface-variant">Ничего не найдено</div>
            ) : (
              filtered.map((o) => (
                <CollectionRow
                  key={o.name}
                  name={o.name}
                  floorTon={floors[o.name]}
                  rates={rates}
                  isSel={o.name === selected}
                  rootRef={listRef}
                  onSelect={() => {
                    onChange(o.name);
                    setOpen(false);
                  }}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
