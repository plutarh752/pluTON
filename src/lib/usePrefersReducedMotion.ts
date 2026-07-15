"use client";

import { useEffect, useState } from "react";

// Клиентский хук: истина, если пользователь просит уменьшить движение (prefers-reduced-motion: reduce).
// Нужен для JS-гейтов эффектов (градиент за курсором, рябь, тайминги взрыва/пролёта) — CSS-анимации
// и так отключены allow-list'ом в globals.css, но JS-часть надо гасить отдельно.
// Стартуем с false (SSR-безопасно), уточняем после монтирования — визуал при reduce всё равно статичный.
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
