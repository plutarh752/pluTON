import { cache } from "react";
import { prisma } from "./db";
import { isGiftSatelliteConfigured } from "./secrets";

// Флаг «онбординг пройден» — отдельная персистентная запись Setting{key:"onboarding"}, НЕ эвристика по
// наличию ключей (см. CLAUDE.md инв. 10 про GIFT_SATELLITE_KEY-гейт — это другой, уже существующий гейт).
// Бэкфилл для уже настроенных установок: если строки флага нет, но giftSatelliteKey уже задан — считаем
// онбординг пройденным и лениво дописываем строку, без отдельного скрипта миграции.
const SETTINGS_KEY = "onboarding";

interface OnboardingValue {
  completed?: boolean;
  completedAt?: string;
}

// cache() дедуплицирует чтение флага в рамках одного рендера запроса (root layout + page-level гейт бьют
// в один and тот же вызов вместо двух round-trip'ов в Neon) — request-scoped memoization из React,
// не персистентный TTL-кэш (тот паттерн, что в secrets.ts, решает другую задачу — сотни вызовов за прогон).
export const getOnboardingCompleted = cache(async (): Promise<boolean> => {
  const setting = await prisma.setting.findUnique({ where: { key: SETTINGS_KEY } });
  const value = setting?.value as OnboardingValue | null;
  if (value?.completed) return true;

  if (await isGiftSatelliteConfigured()) {
    await setOnboardingCompleted();
    return true;
  }
  return false;
});

export async function setOnboardingCompleted(): Promise<void> {
  const value: OnboardingValue = { completed: true, completedAt: new Date().toISOString() };
  await prisma.setting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: value as object },
    update: { value: value as object },
  });
}
