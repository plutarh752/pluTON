import { NextResponse } from "next/server";
import { GiftSatellite } from "@/lib/giftSatellite";
import { getSecretsStatus, setSecrets, type Field } from "@/lib/secrets";

// Экран /settings: ввод API-ключей (GIFT_SATELLITE_KEY/TONAPI_KEY/TELEGRAM_*) в БД вместо .env.
// GET отдаёт только booleans (задано/нет) — плейнтекст секретов клиенту не возвращается никогда.
export const dynamic = "force-dynamic";

const FIELDS: Field[] = ["giftSatelliteKey", "tonapiKey", "telegramApiId", "telegramApiHash", "telegramSession"];

export async function GET() {
  return NextResponse.json({ status: await getSecretsStatus() });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const partial: Partial<Record<Field, string | null>> = {};
  for (const f of FIELDS) {
    const v = body[f];
    if (typeof v === "string" && v.trim()) partial[f] = v.trim();
  }
  const clear = Array.isArray(body.clear) ? body.clear : [];
  for (const f of clear) {
    if (FIELDS.includes(f as Field)) partial[f as Field] = null;
  }

  await setSecrets(partial);

  // Только что сохранённый gift-satellite ключ сразу проверяем дешёвым каталожным вызовом — не блокирует
  // сохранение при сетевом сбое, просто необязательная подсказка в ответе.
  let test: { ok: boolean; error?: string } | null = null;
  if (partial.giftSatelliteKey) {
    try {
      await new GiftSatellite().getCollections();
      test = { ok: true };
    } catch (e) {
      test = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  return NextResponse.json({ ok: true, status: await getSecretsStatus(), test });
}
