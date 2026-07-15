import { NextResponse } from "next/server";
import { isGiftSatelliteConfigured } from "@/lib/secrets";
import { setOnboardingCompleted } from "@/lib/onboarding";

// Экран /onboarding: сохранение секретов идёт через существующий POST /api/settings (реюз, не дублируем
// логику шифрования) — этот роут только выставляет флаг «онбординг пройден» ПОСЛЕ этого. Серверная защита
// от обхода: без giftSatelliteKey флаг не ставим, даже если запрос пришёл напрямую мимо формы.
export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await isGiftSatelliteConfigured())) {
    return NextResponse.json({ error: "gift_satellite_key_required" }, { status: 400 });
  }
  await setOnboardingCompleted();
  return NextResponse.json({ ok: true });
}
