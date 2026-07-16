"use client";

import { useEffect, useRef } from "react";

// Прогресс-бар + консоль-лог для прогонов «Получить цены»/«Получить объём». Чисто презентационный:
// проценты/фаза сверху, живой лог тянущегося прямо сейчас — снизу (как консоль). Данные приходят из
// поллинга статуса (см. useRunPoller). Палитра — Mono-Light Minimalist (чёрная заливка на сером треке).

export interface RunProgressData {
  done: number;
  total: number;
  label: string;
  phase: string;
}

export function RunProgress({
  phase,
  done,
  total,
  log,
}: {
  phase: string;
  done: number;
  total: number;
  log: string[];
}) {
  const indeterminate = total <= 0;
  const percent = indeterminate ? 0 : Math.min(100, Math.round((done / total) * 100));
  const scroller = useRef<HTMLDivElement>(null);

  // Автопрокрутка лога к последней строке (новое — снизу).
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  return (
    <div className="w-full max-w-md">
      <div className="mb-1.5 flex items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-widest text-on-surface-variant">
        <span className="min-w-0 truncate">{phase || "Идёт сбор…"}</span>
        <span className="shrink-0 tabular-nums text-primary">
          {indeterminate ? "…" : `${percent}%`}
          {!indeterminate && total > 0 ? <span className="text-on-surface-variant"> · {done}/{total}</span> : null}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
        {indeterminate ? (
          <div className="pl-progress-indeterminate h-full w-1/3 rounded-full bg-primary/70" />
        ) : (
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        )}
      </div>

      {/* Живой лог — как консоль: старые строки затухают сверху (mask), новая внизу подсвечена + курсор. */}
      <div
        ref={scroller}
        className="no-scrollbar mt-3 h-28 overflow-hidden rounded border border-outline-variant bg-surface-container-low px-3 py-2 font-mono text-[10px] leading-relaxed text-on-surface-variant"
        style={{
          maskImage: "linear-gradient(to bottom, transparent, black 34%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent, black 34%)",
        }}
      >
        {log.length === 0 ? (
          <div className="opacity-60">
            подключение…<span className="pl-cursor-blink">▍</span>
          </div>
        ) : (
          log.map((line, i) => {
            const isLast = i === log.length - 1;
            return (
              <div key={`${i}-${line}`} className={"truncate " + (isLast ? "text-primary" : "")}>
                <span className="opacity-40">›</span> {line}
                {isLast && <span className="pl-cursor-blink">▍</span>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
