import { redirect } from "next/navigation";
import { isGiftSatelliteConfigured } from "./secrets";

// Гейт основных страниц: без GIFT_SATELLITE_KEY (основной источник данных всего приложения) редиректим
// на /settings вместо рендера. Framework-aware код (next/navigation) намеренно НЕ в secrets.ts — тот
// импортируют голые tsx-воркеры без Next-рантайма. `next` сохраняет путь, куда вернуться после сохранения.
export async function requireGiftSatelliteConfigured(pathWithQuery: string): Promise<void> {
  if (await isGiftSatelliteConfigured()) return;
  redirect(`/settings?next=${encodeURIComponent(pathWithQuery)}`);
}
