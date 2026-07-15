import { redirect } from "next/navigation";
import { isGiftSatelliteConfigured } from "./secrets";
import { getOnboardingCompleted } from "./onboarding";

// Гейт первого запуска: пока флаг «онбординг пройден» не стоит — редиректим на /onboarding вместо рендера.
// Framework-aware код (next/navigation) намеренно НЕ в onboarding.ts — тот импортируют голые tsx-воркеры
// без Next-рантайма (см. инв. 10). Проверяется ПЕРЕД requireGiftSatelliteConfigured — первый запуск важнее.
export async function requireOnboarded(pathWithQuery: string): Promise<void> {
  if (await getOnboardingCompleted()) return;
  redirect(`/onboarding?next=${encodeURIComponent(pathWithQuery)}`);
}

// Гейт основных страниц: без GIFT_SATELLITE_KEY (основной источник данных всего приложения) редиректим
// на /settings вместо рендера. Framework-aware код (next/navigation) намеренно НЕ в secrets.ts — тот
// импортируют голые tsx-воркеры без Next-рантайма. `next` сохраняет путь, куда вернуться после сохранения.
export async function requireGiftSatelliteConfigured(pathWithQuery: string): Promise<void> {
  if (await isGiftSatelliteConfigured()) return;
  redirect(`/settings?next=${encodeURIComponent(pathWithQuery)}`);
}
