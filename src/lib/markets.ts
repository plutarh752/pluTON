// Чистые константы маркетов (без process.env / сети) — можно импортировать в клиентские компоненты,
// не таща туда весь API-клиент giftSatellite. Единый источник истины: giftSatellite ре-экспортирует
// эти же символы, поэтому существующие импорты `from "@/lib/giftSatellite"` не ломаются.

export type Market = "tg" | "portals" | "tonnel" | "mrkt" | "getgems";
export const MARKETS: Market[] = ["tg", "portals", "tonnel", "mrkt", "getgems"];

const MARKET_LABELS: Record<string, string> = {
  tg: "Telegram",
  telegram: "Telegram",
  portals: "Portals",
  tonnel: "Tonnel",
  mrkt: "MRKT",
  getgems: "Getgems",
};

/** Человекочитаемый ярлык маркета по коду. */
export function marketLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return MARKET_LABELS[code.toLowerCase()] ?? code;
}
