import type { CSSProperties } from "react";

// Capped stagger для entrance-анимаций списков: первые CAP элементов задерживаются по индексу
// (шаг STEP мс), дальше — все вместе, чтобы длинные списки не тянули каскад дольше ~1.8s.
export function revealStyle(index: number, step = 180, cap = 10): CSSProperties {
  return { animationDelay: `${Math.min(index, cap) * step}ms` };
}
