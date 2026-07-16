import { NextResponse } from "next/server";
import { getTelegramCreds, setSecrets } from "@/lib/secrets";
import { cancelLogin, startLogin, submitCode, submitPassword, type LoginResult } from "@/lib/portalsLogin";

// UI-мастер Telegram-входа для вкладки «Объёмы» (инв. 9): получает session-строку прямо в /settings, без
// консольного npm run portals:login (обычному пользователю консоль недоступна). Живой процесс входа —
// в src/lib/portalsLogin.ts (server-only). Синхронный request/response с дискриминатором `action` (не
// поллинг, как /api/prices). Строку сессии клиенту НЕ возвращаем — сохраняем в зашифрованную БД (инв. 10).
export const dynamic = "force-dynamic";

/** Урезаем ответ до безопасного для клиента: session/apiId/apiHash из `ok` НЕ уходят в браузер. */
function toClient(res: LoginResult) {
  switch (res.status) {
    case "code_sent":
    case "password_needed":
      return { status: res.status, loginId: res.loginId };
    case "ok":
      return { status: "ok", user: res.user };
    case "error":
      return { status: "error", error: res.error, detail: res.detail };
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const action = body.action;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  if (action === "start") {
    const phone = str(body.phone);
    if (!phone) return NextResponse.json({ status: "error", error: "phone_required" });
    // Креды: типизированные (ещё не сохранённые) значения из формы имеют приоритет, иначе — из БД.
    let apiId = str(body.apiId) || null;
    let apiHash = str(body.apiHash) || null;
    if (!apiId || !apiHash) {
      const creds = await getTelegramCreds();
      apiId = apiId ?? creds.apiId;
      apiHash = apiHash ?? creds.apiHash;
    }
    if (!apiId || !apiHash) return NextResponse.json({ status: "error", error: "api_creds_missing" });
    return NextResponse.json(toClient(await startLogin(apiId, apiHash, phone)));
  }

  if (action === "code") {
    const loginId = str(body.loginId);
    const code = str(body.code);
    if (!loginId || !code) return NextResponse.json({ status: "error", error: "bad_request" });
    const res = await submitCode(loginId, code);
    if (res.status === "ok") await persist(res);
    return NextResponse.json(toClient(res));
  }

  if (action === "password") {
    const loginId = str(body.loginId);
    const password = typeof body.password === "string" ? body.password : "";
    if (!loginId || !password) return NextResponse.json({ status: "error", error: "bad_request" });
    const res = await submitPassword(loginId, password);
    if (res.status === "ok") await persist(res);
    return NextResponse.json(toClient(res));
  }

  if (action === "cancel") {
    const loginId = str(body.loginId);
    if (loginId) cancelLogin(loginId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ status: "error", error: "unknown_action" }, { status: 400 });
}

/** Успех: сессия + креды входа сразу в зашифрованную БД (apiId/apiHash идемпотентно — на случай, если их
 *  ввели в форме, но ещё не сохранили). Плейнтекст не логируем. */
async function persist(res: Extract<LoginResult, { status: "ok" }>): Promise<void> {
  await setSecrets({
    telegramSession: res.session,
    telegramApiId: res.apiId,
    telegramApiHash: res.apiHash,
  });
}
