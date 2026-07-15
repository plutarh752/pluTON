"use client";

import { useMemo, type CSSProperties } from "react";
import { PlanetSphere } from "@/components/serenity/PlanetSphere";
import { TonLogo } from "@/components/serenity/TonLogo";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

// Планета мастера онбординга: живёт ВНЕ key={step}-контейнера (в корне OnboardingForm), чтобы не
// перезапускаться на каждом шаге. По шагу детерминированно считает позицию/размер/интенсивность
// деформации: заставка (0) — статичный шар в правом верхнем углу; шаги 1..5 — дрейф из угла к центру +
// НАРАСТАЮЩАЯ пульс-деформация (амплитуда --amp и скорость растут с каждым шагом); «Готово» (6) — по
// центру, максимум деформации, откуда идёт взрыв: exploding → планета РАСПАДАЕТСЯ на логотипы TON,
// которые разлетаются в разные стороны (сзади ничего не появляется). z-0, pointer-events-none.

// Позиция ЦЕНТРА шара в % вьюпорта + размер + параметры пульса (amp — амплитуда сжатия, растёт;
// wobbleDur/pulseDur — периоды, короче = живее). null-пульс = статичная планета (заставка).
type PlanetStep = {
  cx: number;
  cy: number;
  size: number;
  wobbleDur: number;
  pulseDur: number;
  amp: number | null;
};
const STEP_CONFIG: PlanetStep[] = [
  { cx: 96, cy: 6, size: 200, wobbleDur: 5.5, pulseDur: 3.6, amp: null }, // 0 splash — статична
  { cx: 90, cy: 14, size: 212, wobbleDur: 5.5, pulseDur: 3.6, amp: 0.03 }, // 1
  { cx: 84, cy: 20, size: 232, wobbleDur: 4.6, pulseDur: 3.0, amp: 0.055 }, // 2
  { cx: 78, cy: 26, size: 254, wobbleDur: 3.7, pulseDur: 2.4, amp: 0.085 }, // 3
  { cx: 72, cy: 30, size: 278, wobbleDur: 2.9, pulseDur: 2.0, amp: 0.1 }, // 4
  { cx: 66, cy: 34, size: 300, wobbleDur: 2.2, pulseDur: 1.7, amp: 0.11 }, // 5 — чуть слабее к концу
  { cx: 50, cy: 50, size: 328, wobbleDur: 1.7, pulseDur: 1.5, amp: 0.12 }, // 6 finish — взрыв отсюда
];

const FRAGMENTS = 11;
const GOLDEN = 2.399963; // золотой угол (рад) — равномерный phyllotaxis-разброс осколков

export function OnboardingPlanet({
  step,
  exploding,
}: {
  step: number;
  total?: number; // принимается для ясности вызова, в расчёте не участвует
  exploding: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  const cfg = STEP_CONFIG[Math.min(step, STEP_CONFIG.length - 1)];

  // Осколки-логотипы: стартуют плотным кластером (силуэт планеты, phyllotaxis-заполнение), улетают
  // радиально наружу (--fx/--fy по своему углу) + поворот. Каждый — отдельная сторона.
  const fragments = useMemo(() => {
    const fragSize = Math.round(cfg.size * 0.3);
    return Array.from({ length: FRAGMENTS }, (_, i) => {
      const a = i * GOLDEN;
      const rInit = cfg.size * (0.06 + 0.26 * Math.sqrt(i / (FRAGMENTS - 1)));
      const R = cfg.size * (0.62 + 0.16 * ((i % 3) / 2));
      return {
        bx: Math.cos(a) * rInit,
        by: Math.sin(a) * rInit,
        fx: Math.cos(a) * R,
        fy: Math.sin(a) * R,
        fr: ((i * 53) % 150) - 75,
        fragSize,
      };
    });
  }, [cfg.size]);

  const wrapperStyle: CSSProperties = {
    left: `${cfg.cx}%`,
    top: `${cfg.cy}%`,
    width: cfg.size,
    height: cfg.size,
    transform: "translate(-50%, -50%)",
    transition: reduced
      ? undefined
      : "left 500ms cubic-bezier(0.16,1,0.3,1), top 500ms cubic-bezier(0.16,1,0.3,1), width 500ms cubic-bezier(0.16,1,0.3,1), height 500ms cubic-bezier(0.16,1,0.3,1)",
  };

  const pulseOn = !reduced && cfg.amp != null && !exploding;

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute ${exploding ? "z-40" : "z-0"}`}
      style={wrapperStyle}
    >
      {exploding ? (
        // Планета распадается на логотипы TON, летящие в разные стороны (кроме reduced-motion).
        !reduced &&
        fragments.map((f, i) => (
          <TonLogo
            key={i}
            className="planet-fragment absolute"
            style={
              {
                left: `calc(50% + ${f.bx}px)`,
                top: `calc(50% + ${f.by}px)`,
                width: f.fragSize,
                height: f.fragSize,
                marginLeft: -f.fragSize / 2,
                marginTop: -f.fragSize / 2,
                "--fx": `${f.fx}px`,
                "--fy": `${f.fy}px`,
                "--fr": `${f.fr}deg`,
              } as CSSProperties
            }
          />
        ))
      ) : (
        <PlanetSphere
          className={pulseOn ? "planet-wobble h-full w-full" : "h-full w-full"}
          style={
            pulseOn
              ? ({
                  "--wobble-dur": `${cfg.wobbleDur}s`,
                  "--pulse-dur": `${cfg.pulseDur}s`,
                  "--amp": `${cfg.amp}`,
                } as CSSProperties)
              : undefined
          }
        />
      )}
    </div>
  );
}
