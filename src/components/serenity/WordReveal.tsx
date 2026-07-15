"use client";

import { useEffect, type CSSProperties, type ElementType } from "react";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

// Пословное появление текста (механика «Digital Serenity»): строка рвётся по пробелам, каждому слову —
// свой animationDelay и длительность (--word-dur), CSS-класс .word-animate проигрывает подъём+масштаб+
// расфокус. reduced-motion: слова видимы сразу (базовый .word-animate{opacity:1} вне media-блока),
// onDone стреляет почти мгновенно. onDone нужен оверлею возврата — знать, когда запускать пролёт планеты.
export function WordReveal({
  text,
  as: Tag = "span",
  className = "",
  wordClassName = "",
  startDelay = 200,
  stepDelay = 90,
  wordDuration = 700,
  onDone,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  wordClassName?: string;
  startDelay?: number;
  stepDelay?: number;
  wordDuration?: number;
  onDone?: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const words = text.split(/\s+/).filter(Boolean);

  useEffect(() => {
    if (!onDone) return;
    const total = reduced ? 300 : startDelay + words.length * stepDelay + wordDuration;
    const t = setTimeout(onDone, total);
    return () => clearTimeout(t);
    // text — стабильный ключ содержимого; тайминги фиксированы на маунте.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, reduced]);

  return (
    <Tag className={className}>
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          className={`word-animate ${wordClassName}`}
          style={
            {
              animationDelay: `${startDelay + i * stepDelay}ms`,
              "--word-dur": `${wordDuration}ms`,
            } as CSSProperties
          }
        >
          {word}
        </span>
      ))}
    </Tag>
  );
}
