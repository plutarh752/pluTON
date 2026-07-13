import { prisma } from "./db";
import type { Rates } from "./format";

// Курсы TON→USD и Stars→USD из settings.rates (как в воркере). Дефолты — на случай отсутствия строки.
export async function getRates(): Promise<Rates> {
  const row = await prisma.setting.findUnique({ where: { key: "rates" } });
  const rv = (row?.value as { ton_usd?: number; stars_usd?: number } | null) ?? {};
  return { ton_usd: rv.ton_usd ?? 1.78, stars_usd: rv.stars_usd ?? 0.013 };
}
