import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { TopNav, MobileNav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WelcomeBackOverlay } from "@/components/WelcomeBackOverlay";
import { getOnboardingCompleted } from "@/lib/onboarding";
import "./globals.css";

const geist = Geist({ subsets: ["latin", "cyrillic"], variable: "--font-geist", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "PluTON — Gift Tracker",
  description: "Персональный мультимаркетный трекер цен коллекционных Telegram-подарков (TON)",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // getOnboardingCompleted() кэширована через react cache() — этот же вызов внутри requireOnboarded()
  // на конкретной странице (см. src/lib/requireConfigured.ts) переиспользует результат, не бьёт в БД дважды.
  const onboarded = await getOnboardingCompleted();

  return (
    <html lang="ru" className={`${geist.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-background font-sans text-on-background">
        <TopNav />
        <WelcomeBackOverlay onboarded={onboarded} />
        <div className="pb-16 md:pb-0">{children}</div>
        <Footer />
        <MobileNav />
      </body>
    </html>
  );
}
