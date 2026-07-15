"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

// Фоновая атмосфера «Digital Serenity» (адаптировано под чёрно-белую палитру): плавающие точки + рябь
// при клике. (Сетка, декоративные уголки и градиент за курсором убраны по требованию.)
// Монтируется ТОЛЬКО там, где нужен эффект (заставка мастера / welcome-back) — document-слушатель клика
// живёт ровно во время показа экрана и чистится в cleanup. Визуал: absolute inset-0, z-0,
// pointer-events-none (не мешает кликам/вводу). reduced-motion: рябь не вешается, точки статичны.

// Детерминированные позиции точек (%) + задержка флоата — чтобы не было SSR-расхождений.
const DOTS = [
  { left: "12%", top: "22%", delay: "0s" },
  { left: "26%", top: "68%", delay: "0.6s" },
  { left: "38%", top: "38%", delay: "1.2s" },
  { left: "52%", top: "80%", delay: "0.3s" },
  { left: "61%", top: "18%", delay: "1.8s" },
  { left: "72%", top: "58%", delay: "0.9s" },
  { left: "84%", top: "32%", delay: "1.5s" },
  { left: "90%", top: "74%", delay: "0.2s" },
  { left: "18%", top: "50%", delay: "2.1s" },
  { left: "46%", top: "12%", delay: "1.1s" },
];

type Ripple = { id: number; x: number; y: number };

export function SerenityBackdrop() {
  const reduced = usePrefersReducedMotion();
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (reduced) return;

    const onClick = (e: MouseEvent) => {
      const id = Date.now() + Math.random();
      setRipples((r) => [...r, { id, x: e.clientX, y: e.clientY }]);
      const t = window.setTimeout(
        () => setRipples((r) => r.filter((rp) => rp.id !== id)),
        1000,
      );
      timers.current.push(t);
    };

    document.addEventListener("click", onClick);
    const localTimers = timers.current;
    return () => {
      document.removeEventListener("click", onClick);
      localTimers.forEach(clearTimeout);
    };
  }, [reduced]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* Плавающие точки */}
      {DOTS.map((d, i) => (
        <span
          key={i}
          className="serenity-dot"
          style={{ left: d.left, top: d.top, animationDelay: d.delay }}
        />
      ))}

      {/* Рябь при клике */}
      {ripples.map((r) => (
        <span key={r.id} className="serenity-ripple" style={{ left: r.x, top: r.y }} />
      ))}
    </div>
  );
}
