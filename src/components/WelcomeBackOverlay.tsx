"use client";

import { useEffect, useState } from "react";

// Экран возврата (Состояние 2): показывается ОДИН раз за сессию вкладки браузера (sessionStorage — не
// переживает закрытие вкладки), поверх любого роута, не только «Витрины» — layout.tsx не перевыполняется
// при клиентской навигации между вкладками, так что сама проверка физически стреляет один раз на полную
// загрузку. Никакой анимации появления/исчезновения — просто conditional render, визуальную анимацию
// добавим отдельным шагом позже.
const SESSION_KEY = "pluton:welcome-shown";
const AUTO_HIDE_MS = 1700;

function greeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Доброе утро";
  if (hour >= 12 && hour < 18) return "Добрый день";
  if (hour >= 18 && hour < 23) return "Добрый вечер";
  return "Доброй ночи";
}

export function WelcomeBackOverlay({ onboarded }: { onboarded: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!onboarded) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    sessionStorage.setItem(SESSION_KEY, "1");
    setVisible(true);

    // Место для будущей фоновой подгрузки цен (не сейчас): пока оверлей показан, здесь можно триггерить
    // предзагрузку данных витрины, чтобы к моменту скрытия оверлея цены уже были готовы.
    const timer = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [onboarded]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-surface-container-lowest">
      <p className="font-headline-lg text-headline-lg text-primary">{greeting()}, с возвращением</p>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-on-surface-variant">PluTON</p>
    </div>
  );
}
