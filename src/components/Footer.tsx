"use client";

import { usePathname } from "next/navigation";

// Футер PluTON v2 (из Stitch-экспорта): копирайт + служебные ссылки + индикатор статуса.
// Клиентский только ради guard'а: на онбординге (полноэкранный мастер) хром скрыт (инв. 11) — арта
// подарков там нет, обязательная атрибуция @GiftChanges на остальных страницах сохраняется.
export function Footer() {
  const pathname = usePathname();
  if (pathname === "/onboarding") return null;
  return (
    <footer className="border-t border-outline-variant bg-surface-container-lowest">
      <div className="mx-auto flex max-w-container flex-col items-center justify-between gap-4 px-margin-mobile py-8 md:flex-row md:px-margin-desktop">
        <span className="text-label-md font-bold uppercase tracking-widest text-on-surface-variant">
          © 2026 PluTON Infrastructure
        </span>
        {/* Атрибуция обязательна по условиям бесплатного API арта подарков (api.changes.tg). */}
        <a
          href="https://t.me/GiftChanges"
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[10px] text-on-surface-variant transition-colors hover:text-primary"
        >
          Gift art via @GiftChanges (changes.tg)
        </a>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="font-mono text-[10px] text-on-surface-variant">SYSTEM STATUS: OPTIMAL</span>
        </div>
      </div>
    </footer>
  );
}
