"use client";

import { useState } from "react";

// Картинка подарка с graceful-фолбэком: URL выводится из slug (CDN Fragment), а при 404 прячем img —
// показывается плейсхолдер-плитка родителя (bg-surface-container-high).
export function GiftImage({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(!src);
  if (failed || !src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} onError={() => setFailed(true)} className="h-full w-full object-cover" />;
}
