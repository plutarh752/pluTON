"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, LayoutGrid, Settings } from "lucide-react";
import { ProfileMenu } from "./ProfileMenu";

// Навигация PluTON v2: 3 экрана — Витрина (/), Мои пресеты (/presets), Объёмы (/volumes).
const NAV = [
  { href: "/", label: "Витрина", icon: LayoutGrid },
  { href: "/presets", label: "Мои пресеты", icon: Settings },
  { href: "/volumes", label: "Объёмы", icon: BarChart3 },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function TopNav() {
  const pathname = usePathname();
  // Онбординг — полноэкранный мастер без хрома приложения (инв. 11).
  if (pathname === "/onboarding") return null;
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-outline-variant bg-surface-container-lowest">
      <div className="mx-auto flex h-16 max-w-container items-center justify-between px-margin-mobile md:px-margin-desktop">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-headline-md text-headline-md font-bold tracking-tighter text-primary">
            PluTON
          </Link>
          <div className="hidden items-center gap-6 md:flex">
            {NAV.map((n) => {
              const active = isActive(pathname, n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={
                    active
                      ? "border-b-2 border-primary pb-2 text-label-md font-bold uppercase tracking-widest text-primary"
                      : "pb-2 text-label-md font-medium uppercase tracking-widest text-on-surface-variant transition-colors hover:text-primary"
                  }
                >
                  {n.label}
                </Link>
              );
            })}
          </div>
        </div>
        <ProfileMenu currentPath={pathname} />
      </div>
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  if (pathname === "/onboarding") return null;
  return (
    <nav className="fixed bottom-0 left-0 z-50 flex h-16 w-full items-center justify-around border-t border-outline-variant bg-surface-container-lowest md:hidden">
      {NAV.map((n) => {
        const active = isActive(pathname, n.href);
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            href={n.href}
            className={"flex flex-col items-center gap-1 " + (active ? "text-primary" : "text-on-surface-variant")}
          >
            <Icon size={20} />
            <span className="text-[10px] font-label-caps uppercase tracking-widest">{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
