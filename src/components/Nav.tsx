"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Settings, User } from "lucide-react";

// Навигация PluTON v2: 2 экрана — Витрина (/) и Мои пресеты (/presets).
const NAV = [
  { href: "/", label: "Витрина", icon: LayoutGrid },
  { href: "/presets", label: "Мои пресеты", icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function TopNav() {
  const pathname = usePathname();
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
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant bg-surface-container text-primary">
          <User size={18} />
        </div>
      </div>
    </nav>
  );
}

export function SideNav() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-16 hidden h-[calc(100vh-64px)] w-64 shrink-0 flex-col border-r border-outline-variant bg-surface-container-low py-8 md:flex">
      <div className="mb-8 px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-highest text-primary">
            <User size={18} />
          </div>
          <div>
            <div className="font-label-caps text-label-caps text-primary">PluTON</div>
            <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">Gift Tracker</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-1">
        {NAV.map((n) => {
          const active = isActive(pathname, n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={
                "flex items-center gap-3 px-6 py-3 transition-colors " +
                (active
                  ? "border-r-2 border-primary bg-surface-container-highest text-primary"
                  : "text-on-surface-variant hover:bg-surface-container")
              }
            >
              <Icon size={18} />
              <span className="font-label-caps text-label-caps">{n.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
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
