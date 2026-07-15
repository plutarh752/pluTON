"use client";

import { useEffect, useState } from "react";
import { PlanetSphere } from "@/components/serenity/PlanetSphere";
import { SerenityBackdrop } from "@/components/serenity/SerenityBackdrop";
import { WordReveal } from "@/components/serenity/WordReveal";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

// Экран возврата (Состояние 2): показывается ОДИН раз за сессию вкладки браузера (sessionStorage — не
// переживает закрытие вкладки), поверх любого роута, не только «Витрины» — layout.tsx не перевыполняется
// при клиентской навигации между вкладками, так что сама проверка физически стреляет один раз на полную
// загрузку.
// Анимация (фазовый таймлайн): сначала «Digital Serenity» + приветствие проявляется ПОСЛОВНО (крупнее и
// медленнее — текста мало, слово смакуется); когда текст полностью проявился — ОДИН раз позади текста
// пролетает планета (~2с, без деформации/взрыва); затем оверлей скрывается → интерфейс.
// reduced-motion: без пословной/пролётной анимации — статичный текст ~1.2с, затем скрытие.
const SESSION_KEY = "pluton:welcome-shown";
const FLYBY_MS = 2000;
const REDUCED_HOLD_MS = 900;

function greeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Доброе утро";
  if (hour >= 12 && hour < 18) return "Добрый день";
  if (hour >= 18 && hour < 23) return "Добрый вечер";
  return "Доброй ночи";
}

export function WelcomeBackOverlay({ onboarded }: { onboarded: boolean }) {
  const reduced = usePrefersReducedMotion();
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<"reveal" | "flyby">("reveal");

  useEffect(() => {
    if (!onboarded) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    sessionStorage.setItem(SESSION_KEY, "1");
    setVisible(true);

    // Место для будущей фоновой подгрузки цен (не сейчас): пока оверлей показан, здесь можно триггерить
    // предзагрузку данных витрины, чтобы к моменту скрытия оверлея цены уже были готовы.
  }, [onboarded]);

  // Пролёт длится ~2с → скрыть оверлей.
  useEffect(() => {
    if (phase !== "flyby") return;
    const t = setTimeout(() => setVisible(false), FLYBY_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // Текст проявился: при reduced — просто подержать и скрыть; иначе — запустить пролёт планеты.
  function onRevealDone() {
    if (reduced) {
      setTimeout(() => setVisible(false), REDUCED_HOLD_MS);
    } else {
      setPhase("flyby");
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-surface-container-lowest">
      <SerenityBackdrop />

      {/* Планета — один пролёт позади текста (после проявления). */}
      {phase === "flyby" && !reduced && (
        <PlanetSphere
          className="planet-flyby absolute left-1/2 top-1/2 z-0"
          style={{ width: 200, height: 200, marginLeft: -100, marginTop: -100 }}
        />
      )}

      <div className="relative z-10 flex flex-col items-center">
        <WordReveal
          as="p"
          text={`${greeting()}, с возвращением`}
          className="font-headline-lg text-headline-lg text-primary"
          startDelay={120}
          stepDelay={200}
          wordDuration={900}
          onDone={onRevealDone}
        />
        <p
          className="reveal-fade mt-2 font-mono text-[11px] uppercase tracking-widest text-on-surface-variant"
          style={{ animationDelay: "1200ms" }}
        >
          PluTON
        </p>
      </div>
    </div>
  );
}
