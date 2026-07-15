"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { KeyRound, LifeBuoy, Terminal, User, X } from "lucide-react";

// Радиус выезжающих кружков-пунктов (px) — под текущий размер кнопки в шапке (h-10 w-10 = 40px).
const ITEM_OFFSET = 44;

const CIRCLE_BUTTON =
  "flex h-10 w-10 items-center justify-center rounded-full border bg-surface-container transition-colors";
const CIRCLE_IDLE = "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary";
const CIRCLE_ACTIVE = "border-primary text-primary";

type Props = {
  currentPath: string;
};

export function ProfileMenu({ currentPath }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Закрытие меню по клику снаружи / Esc (паттерн из Showcase.tsx / BackdropMultiSelect).
  useEffect(() => {
    if (!isExpanded) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setIsExpanded(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsExpanded(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [isExpanded]);

  const isSettingsActive = currentPath.startsWith("/settings");

  return (
    <div ref={wrapRef} className="relative h-10 w-10">
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        aria-haspopup="true"
        aria-expanded={isExpanded}
        aria-label={isExpanded ? "Закрыть меню" : "Профиль"}
        className={
          CIRCLE_BUTTON + " relative z-50 " + (isExpanded ? CIRCLE_ACTIVE : CIRCLE_IDLE)
        }
      >
        <span className="relative block h-[18px] w-[18px]">
          <span
            className={
              "absolute inset-0 flex items-center justify-center transition-all duration-300 ease-in-out " +
              (isExpanded ? "rotate-180 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100")
            }
          >
            <User size={18} />
          </span>
          <span
            className={
              "absolute inset-0 flex items-center justify-center transition-all duration-300 ease-in-out " +
              (isExpanded ? "rotate-0 scale-100 opacity-100" : "-rotate-180 scale-0 opacity-0")
            }
          >
            <X size={18} />
          </span>
        </span>
      </button>

      <Link
        href="/settings"
        aria-label="Настройки API-ключей"
        onClick={() => setIsExpanded(false)}
        className={CIRCLE_BUTTON + " absolute left-0 top-0 " + (isSettingsActive ? CIRCLE_ACTIVE : CIRCLE_IDLE)}
        style={{
          transform: `translateY(${isExpanded ? ITEM_OFFSET : 0}px)`,
          opacity: isExpanded ? 1 : 0,
          zIndex: 40,
          transition: "transform 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 300ms",
          pointerEvents: isExpanded ? "auto" : "none",
        }}
      >
        <KeyRound size={18} />
      </Link>

      <button
        type="button"
        aria-label="Терминал"
        onClick={() => setIsExpanded(false)}
        className={CIRCLE_BUTTON + " absolute left-0 top-0 " + CIRCLE_IDLE}
        style={{
          transform: `translateY(${isExpanded ? ITEM_OFFSET * 2 : 0}px)`,
          opacity: isExpanded ? 1 : 0,
          zIndex: 30,
          transition: "transform 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 300ms",
          pointerEvents: isExpanded ? "auto" : "none",
        }}
      >
        <Terminal size={18} />
      </button>

      <a
        href="https://t.me/lill_chich"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Поддержка"
        onClick={() => setIsExpanded(false)}
        className={CIRCLE_BUTTON + " absolute left-0 top-0 " + CIRCLE_IDLE}
        style={{
          transform: `translateY(${isExpanded ? ITEM_OFFSET * 3 : 0}px)`,
          opacity: isExpanded ? 1 : 0,
          zIndex: 20,
          transition: "transform 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 300ms",
          pointerEvents: isExpanded ? "auto" : "none",
        }}
      >
        <LifeBuoy size={18} />
      </a>
    </div>
  );
}
