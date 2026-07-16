"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Send } from "lucide-react";

// Инлайн-мастер Telegram-входа в /settings: телефон → код из Telegram → (при 2FA облачный пароль). Заменяет
// консольный npm run portals:login для получения TELEGRAM_SESSION (инв. 9). Живой процесс входа держится на
// сервере (src/lib/portalsLogin.ts); сюда строка сессии НЕ приходит — сервер сам пишет её в БД (инв. 10),
// на успех дёргаем onLinked, чтобы форма показала «✓ настроено».

type Step = "phone" | "code" | "password" | "done";

const ERR: Record<string, string> = {
  api_creds_missing: "Сначала заполни API ID и API Hash выше",
  phone_required: "Введи номер телефона",
  phone_invalid: "Неверный номер телефона",
  code_invalid: "Неверный код — попробуй ещё раз",
  code_expired: "Код истёк — начни заново",
  no_code_sent: "Код не был отправлен — начни заново",
  password_invalid: "Неверный облачный пароль (2FA)",
  session_expired: "Сессия входа истекла — начни заново",
  login_timeout: "Telegram не ответил вовремя — попробуй заново",
  login_process_exited: "Процесс входа завершился — начни заново",
  send_code_failed: "Не удалось отправить код",
  sign_in_failed: "Не удалось войти",
  connect_failed: "Не удалось подключиться к Telegram",
  pyrogram_missing: "Не установлен Python-пакет pyrogram (pip install -r requirements.txt)",
};

function human(error?: string, detail?: string): string {
  if (error && ERR[error]) return ERR[error];
  return `Ошибка: ${error ?? "unknown"}${detail ? ` (${detail})` : ""}`;
}

export function TelegramLoginDialog({
  apiId,
  apiHash,
  onLinked,
  onClose,
}: {
  apiId?: string;
  apiHash?: string;
  onLinked: (user: string) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loginId, setLoginId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<string | null>(null);
  const loginIdRef = useRef<string | null>(null); // для cancel на размонтировании

  // Незавершённый вход при закрытии/уходе — убиваем процесс на сервере.
  useEffect(() => {
    return () => {
      const id = loginIdRef.current;
      if (id) {
        fetch("/api/settings/telegram-login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "cancel", loginId: id }),
          keepalive: true,
        }).catch(() => {});
      }
    };
  }, []);

  async function post(payload: Record<string, unknown>) {
    const r = await fetch("/api/settings/telegram-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return r.json() as Promise<{ status?: string; loginId?: string; user?: string; error?: string; detail?: string }>;
  }

  function setId(id: string | null) {
    loginIdRef.current = id;
    setLoginId(id);
  }

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const d = await post({ action: "start", phone: phone.trim(), apiId, apiHash });
      if (d.status === "code_sent" && d.loginId) {
        setId(d.loginId);
        setStep("code");
      } else {
        setError(human(d.error, d.detail));
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode() {
    if (!loginId) return;
    setBusy(true);
    setError(null);
    try {
      const d = await post({ action: "code", loginId, code: code.trim() });
      if (d.status === "ok") finishOk(d.user ?? "");
      else if (d.status === "password_needed") setStep("password");
      else {
        setError(human(d.error, d.detail));
        if (["code_expired", "session_expired", "login_process_exited", "no_code_sent"].includes(d.error ?? "")) {
          resetToPhone();
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmPassword() {
    if (!loginId) return;
    setBusy(true);
    setError(null);
    try {
      const d = await post({ action: "password", loginId, password });
      if (d.status === "ok") finishOk(d.user ?? "");
      else {
        setError(human(d.error, d.detail));
        if (["session_expired", "login_process_exited"].includes(d.error ?? "")) resetToPhone();
      }
    } finally {
      setBusy(false);
    }
  }

  function finishOk(u: string) {
    setId(null);
    setUser(u);
    setStep("done");
    onLinked(u);
    setTimeout(onClose, 1800);
  }

  function resetToPhone() {
    setId(null);
    setStep("phone");
    setCode("");
    setPassword("");
  }

  function cancel() {
    if (loginId) cancelLoginRemote(loginId);
    setId(null);
    onClose();
  }

  const inputClass =
    "w-full rounded border border-outline-variant bg-surface-container px-3 py-2 font-mono text-[12px] text-on-background outline-none focus:border-primary disabled:opacity-40";
  const primaryBtn =
    "flex items-center justify-center gap-2 rounded bg-primary px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50";
  const ghostBtn =
    "font-mono text-[10px] uppercase tracking-widest text-on-surface-variant underline hover:text-primary";

  return (
    <div className="mt-2 rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
      {step === "phone" && (
        <div className="flex flex-col gap-2">
          <label className="font-mono text-[11px] uppercase tracking-widest text-on-surface-variant">
            Номер телефона Telegram
          </label>
          <input
            autoFocus
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && phone.trim() && !busy && sendCode()}
            placeholder="+79991234567"
            className={inputClass}
          />
          <p className="font-mono text-[10px] text-on-surface-variant">
            Telegram пришлёт код подтверждения в приложение — введи его на следующем шаге.
          </p>
          <div className="mt-1 flex items-center gap-3">
            <button type="button" onClick={sendCode} disabled={busy || !phone.trim()} className={primaryBtn}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Отправить код
            </button>
            <button type="button" onClick={cancel} className={ghostBtn}>
              отмена
            </button>
          </div>
        </div>
      )}

      {step === "code" && (
        <div className="flex flex-col gap-2">
          <label className="font-mono text-[11px] uppercase tracking-widest text-on-surface-variant">
            Код из Telegram
          </label>
          <input
            autoFocus
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && code.trim() && !busy && confirmCode()}
            placeholder="12345"
            className={inputClass}
          />
          <p className="font-mono text-[10px] text-on-surface-variant">
            Код отправлен на {phone || "твой аккаунт"} в приложение Telegram.
          </p>
          <div className="mt-1 flex items-center gap-3">
            <button type="button" onClick={confirmCode} disabled={busy || !code.trim()} className={primaryBtn}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Подтвердить
            </button>
            <button type="button" onClick={cancel} className={ghostBtn}>
              отмена
            </button>
          </div>
        </div>
      )}

      {step === "password" && (
        <div className="flex flex-col gap-2">
          <label className="font-mono text-[11px] uppercase tracking-widest text-on-surface-variant">
            Облачный пароль (2FA)
          </label>
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && password && !busy && confirmPassword()}
            placeholder="••••••••"
            className={inputClass}
          />
          <p className="font-mono text-[10px] text-on-surface-variant">
            На аккаунте включена двухэтапная аутентификация — введи облачный пароль. Он не сохраняется.
          </p>
          <div className="mt-1 flex items-center gap-3">
            <button type="button" onClick={confirmPassword} disabled={busy || !password} className={primaryBtn}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Войти
            </button>
            <button type="button" onClick={cancel} className={ghostBtn}>
              отмена
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <p className="flex items-center gap-2 font-mono text-[12px] text-emerald-700 dark:text-emerald-400">
          <Check size={16} /> Подключено{user ? ` как ${user}` : ""} — сессия сохранена.
        </p>
      )}

      {error && <p className="mt-2 font-mono text-[11px] text-amber-600">{error}</p>}
    </div>
  );
}

function cancelLoginRemote(loginId: string) {
  fetch("/api/settings/telegram-login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "cancel", loginId }),
    keepalive: true,
  }).catch(() => {});
}
