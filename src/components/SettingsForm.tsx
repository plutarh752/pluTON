"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound, LogIn } from "lucide-react";
import type { Field } from "@/lib/secrets";
import { TelegramLoginDialog } from "./TelegramLoginDialog";

// Форма ввода API-ключей: пустое поле при сабмите = «не менять», явная кнопка «очистить» = удалить
// сохранённое значение. Плейнтекст секретов сюда приходит только из того, что сам пользователь набрал —
// GET /api/settings отдаёт лишь booleans, поэтому уже сохранённые поля показываются плейсхолдером,
// а не реальным значением.
const FIELD_META: { field: Field; label: string; required?: boolean; multiline?: boolean; hint: string }[] = [
  {
    field: "giftSatelliteKey",
    label: "Gift Satellite API-ключ",
    required: true,
    hint: "Создаётся в профиле на gift-satellite.dev. Обязателен — без него приложение не работает.",
  },
  {
    field: "tonapiKey",
    label: "tonapi.io API-ключ",
    hint: "Опционально — на бесплатном тире (1 запрос/сек) работает и без ключа.",
  },
  {
    field: "telegramApiId",
    label: "Telegram API ID",
    hint: "my.telegram.org → API development tools. Нужен только для вкладки «Объёмы».",
  },
  {
    field: "telegramApiHash",
    label: "Telegram API Hash",
    hint: "Оттуда же, в паре с API ID.",
  },
  {
    field: "telegramSession",
    label: "Telegram Session",
    multiline: true,
    hint: "Нажми «Получить» ниже (телефон + код из Telegram) — консоль не нужна. Либо вручную: npm run portals:login.",
  },
];

interface TestResult {
  ok: boolean;
  error?: string;
}

export function SettingsForm({ status, next }: { status: Record<Field, boolean>; next: string }) {
  const router = useRouter();
  const [values, setValues] = useState<Partial<Record<Field, string>>>({});
  const [cleared, setCleared] = useState<Set<Field>>(new Set());
  const [savedStatus, setSavedStatus] = useState(status);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showTgLogin, setShowTgLogin] = useState(false);

  // Кнопка «Получить» для Telegram Session активна, когда API ID и API Hash доступны — уже сохранены ИЛИ
  // только что набраны в форме (тогда они уйдут в БД вместе с полученной сессией на успехе входа).
  const apiCredsReady =
    (savedStatus.telegramApiId || !!values.telegramApiId?.trim()) &&
    (savedStatus.telegramApiHash || !!values.telegramApiHash?.trim());

  function setValue(field: Field, v: string) {
    setValues((s) => ({ ...s, [field]: v }));
    if (v && cleared.has(field)) setCleared((s) => new Set([...s].filter((f) => f !== field)));
  }

  function toggleClear(field: Field) {
    setCleared((s) => {
      const next = new Set(s);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
    setValues((s) => ({ ...s, [field]: "" }));
  }

  async function onSubmit() {
    setBusy(true);
    setMsg(null);
    setTestResult(null);
    try {
      const body: Record<string, unknown> = { ...values, clear: [...cleared] };
      const r = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        setMsg("Не удалось сохранить");
        return;
      }
      const d = await r.json();
      setSavedStatus(d.status);
      setValues({});
      setCleared(new Set());
      setTestResult(d.test ?? null);
      setMsg("Сохранено");
      if (d.status.giftSatelliteKey) {
        setTimeout(() => router.push(next), d.test && !d.test.ok ? 1600 : 700);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex flex-col gap-6 rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
        {FIELD_META.map(({ field, label, required, multiline, hint }) => {
          const isSet = savedStatus[field];
          const willClear = cleared.has(field);
          const inputClass =
            "w-full rounded border border-outline-variant bg-surface-container px-3 py-2 font-mono text-[12px] text-on-background outline-none focus:border-primary disabled:opacity-40";
          return (
            <div key={field}>
              <div className="mb-1 flex items-center gap-2">
                <label className="font-mono text-[11px] uppercase tracking-widest text-on-surface-variant">
                  {label}
                </label>
                {required && <span className="font-mono text-[10px] text-primary">обязательно</span>}
                {isSet && !willClear && (
                  <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-700 dark:text-emerald-400">
                    <Check size={12} /> настроено
                  </span>
                )}
              </div>
              {multiline ? (
                <textarea
                  value={values[field] ?? ""}
                  onChange={(e) => setValue(field, e.target.value)}
                  disabled={willClear}
                  placeholder={isSet ? "•••••• сохранено — оставь пустым, чтобы не менять" : ""}
                  rows={3}
                  className={inputClass}
                />
              ) : (
                <input
                  type="password"
                  value={values[field] ?? ""}
                  onChange={(e) => setValue(field, e.target.value)}
                  disabled={willClear}
                  placeholder={isSet ? "•••••• сохранено — оставь пустым, чтобы не менять" : ""}
                  className={inputClass}
                />
              )}
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="font-mono text-[10px] text-on-surface-variant">{hint}</p>
                {isSet && !required && (
                  <button
                    type="button"
                    onClick={() => toggleClear(field)}
                    className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-on-surface-variant underline hover:text-primary"
                  >
                    {willClear ? "отменить очистку" : "очистить"}
                  </button>
                )}
              </div>
              {field === "telegramSession" &&
                (showTgLogin ? (
                  <TelegramLoginDialog
                    apiId={values.telegramApiId?.trim() || undefined}
                    apiHash={values.telegramApiHash?.trim() || undefined}
                    onClose={() => setShowTgLogin(false)}
                    onLinked={() => {
                      setSavedStatus((p) => ({
                        ...p,
                        telegramSession: true,
                        telegramApiId: true,
                        telegramApiHash: true,
                      }));
                      setValues((s) => ({ ...s, telegramSession: "" }));
                      setCleared((s) => new Set([...s].filter((f) => f !== "telegramSession")));
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowTgLogin(true)}
                    disabled={!apiCredsReady}
                    title={apiCredsReady ? undefined : "Сначала заполни API ID и API Hash"}
                    className="mt-2 flex items-center gap-2 rounded border border-outline-variant px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-on-surface-variant transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-outline-variant disabled:hover:text-on-surface-variant"
                  >
                    <LogIn size={14} />
                    {isSet ? "Переподключить" : "Получить"}
                  </button>
                ))}
            </div>
          );
        })}
      </div>

      <button
        onClick={onSubmit}
        disabled={busy}
        className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-primary px-8 py-4 font-label-caps text-label-caps uppercase tracking-widest text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <KeyRound size={18} />
        {busy ? "Сохраняю…" : "Сохранить"}
      </button>

      {msg && <p className="mt-3 font-mono text-[11px] text-on-surface-variant">{msg}</p>}
      {testResult && (
        <p
          className={
            "mt-2 font-mono text-[11px] " +
            (testResult.ok ? "text-emerald-700 dark:text-emerald-400" : "text-amber-600")
          }
        >
          {testResult.ok
            ? "✓ ключ gift-satellite работает"
            : `⚠ сохранён, но проверка не прошла: ${testResult.error}`}
        </p>
      )}
    </div>
  );
}
