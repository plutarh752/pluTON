import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "PluTON",
  description: "Витрина выгодных лотов Telegram-подарков (TON NFT)",
};

const NAV = [
  { href: "/scan", label: "Скан" },
  { href: "/deals", label: "Deal Finder" },
  { href: "/diff", label: "Diff" },
  { href: "/collections", label: "Коллекции" },
  { href: "/settings", label: "Настройки" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <header className="border-b border-neutral-200 dark:border-neutral-800">
          <nav className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-3">
            <Link href="/deals" className="mr-4 font-semibold">
              💎 PluTON
            </Link>
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
