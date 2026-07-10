import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { TopNav, MobileNav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import "./globals.css";

const geist = Geist({ subsets: ["latin", "cyrillic"], variable: "--font-geist", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "PluTON — Gift Tracker",
  description: "Персональный мультимаркетный трекер цен коллекционных Telegram-подарков (TON)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${geist.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-background font-sans text-on-background">
        <TopNav />
        <div className="pb-16 md:pb-0">{children}</div>
        <Footer />
        <MobileNav />
      </body>
    </html>
  );
}
