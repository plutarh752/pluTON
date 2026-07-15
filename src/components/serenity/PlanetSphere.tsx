import type { CSSProperties } from "react";

// Презентационный «шар» (планета) — монохромный радиальный градиент даёт лёгкий 3D-объём.
// Без состояния и хуков: анимации (wobble/flyby/взрыв) навешиваются снаружи классом/стилем.
// Палитра чёрно-белая: highlight #4a4a4a → тело #111 → край #000 (см. инв. чёрно-белого дизайна).
const SPHERE_BG = "radial-gradient(circle at 35% 30%, #4a4a4a 0%, #111 45%, #000 100%)";

export function PlanetSphere({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className={`rounded-full ${className}`}
      style={{ background: SPHERE_BG, ...style }}
    />
  );
}
