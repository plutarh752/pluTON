"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, KeyRound, LogIn, Rocket, SkipForward } from "lucide-react";
import type { Field } from "@/lib/secrets";
import { TelegramLoginDialog } from "@/components/TelegramLoginDialog";
import { OnboardingPlanet } from "@/components/onboarding/OnboardingPlanet";
import { SerenityBackdrop } from "@/components/serenity/SerenityBackdrop";
import { WordReveal } from "@/components/serenity/WordReveal";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

// Экран первого запуска — пошаговый мастер (один экран = один шаг): заставка → 5 шагов-полей → «Готово».
// Тот же набор из 5 полей, что и /settings (SettingsForm.tsx), и тот же backend-поток сохранения
// (POST /api/settings + POST /api/onboarding) — меняется только подача: по одному полю за раз со Skip/Next.
// Сохранение НЕ на каждом шаге, а один раз на «Финиш».

type FieldStep = {
  kind: "field";
  field: Field;
  label: string;
  hint: string;
  required?: boolean;
  multiline?: boolean;
};
type Step = { kind: "splash" } | FieldStep | { kind: "finish" };

const STEPS: Step[] = [
  { kind: "splash" },
  {
    kind: "field",
    field: "giftSatelliteKey",
    label: "Gift Satellite API-ключ",
    required: true,
    hint: "Основной источник данных всего приложения — без него не работает ни один экран. Создаётся в личном профиле на gift-satellite.dev, вставь как есть.",
  },
  {
    kind: "field",
    field: "tonapiKey",
    label: "tonapi.io API-ключ",
    hint: "Курс TON/USD и legacy-каталог. Бесплатный тир (1 запрос/сек) работает и без ключа — можно донастроить позже в «Настройках».",
  },
  {
    kind: "field",
    field: "telegramApiId",
    label: "Telegram API ID",
    hint: "Нужен только для вкладки «Объёмы» (реальный объём торгов с Portals). my.telegram.org → API development tools.",
  },
  {
    kind: "field",
    field: "telegramApiHash",
    label: "Telegram API Hash",
    hint: "Оттуда же, в паре с API ID (my.telegram.org → API development tools).",
  },
  {
    kind: "field",
    field: "telegramSession",
    label: "Telegram Session",
    multiline: true,
    hint: "Одноразовая строка сессии для вкладки «Объёмы». Нажми «Получить» ниже (телефон + код из Telegram) — консоль не нужна. Либо вручную: npm run portals:login → вставь результат сюда.",
  },
  { kind: "finish" },
];

// Индексы шагов-полей (для нумерации «02 / 06») — заставка и «Готово» из счётчика исключены.
const FIELD_STEP_INDEXES = STEPS.map((s, i) => (s.kind === "field" ? i : -1)).filter((i) => i >= 0);

const inputClass =
  "w-full rounded border border-outline-variant bg-surface-container px-3 py-2 font-mono text-[12px] text-on-background outline-none focus:border-primary";

export function OnboardingForm({ status, next }: { status: Record<Field, boolean>; next: string }) {
  const router = useRouter();
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Partial<Record<Field, string>>>({});
  const [savedStatus] = useState(status);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [exploding, setExploding] = useState(false);
  const [showTgLogin, setShowTgLogin] = useState(false);
  const [tgLinked, setTgLinked] = useState(false);

  const current = STEPS[step];

  // «Получить» доступна, когда API ID и Hash уже набраны на предыдущих шагах (или сохранены ранее) — они
  // уйдут в БД вместе с полученной сессией. В онбординге сессия сохраняется сразу через диалог; значение
  // поля остаётся пустым, а onFinish (POST /api/settings) на пустом telegramSession означает «не менять».
  const apiCredsReady =
    (savedStatus.telegramApiId || !!values.telegramApiId?.trim()) &&
    (savedStatus.telegramApiHash || !!values.telegramApiHash?.trim());

  function setValue(field: Field, v: string) {
    setValues((s) => ({ ...s, [field]: v }));
  }

  function goTo(target: number) {
    setMsg(null);
    setStep(target);
  }

  // Skip опц. поля: очищаем значение (не сохраняем) и идём дальше.
  function skipField(field: Field) {
    setValues((s) => ({ ...s, [field]: "" }));
    goTo(step + 1);
  }

  async function onFinish() {
    setBusy(true);
    setMsg(null);
    // Оптимистичный взрыв планеты — стартует сразу, параллельно с сохранением. При ошибке откатываем.
    setExploding(true);
    // Дать разлёту осколков-логотипов TON (~0.9с) отыграть перед переходом.
    // reduced-motion: осколков нет — короткая пауза и сразу редирект.
    const explodeMs = reduced ? 350 : 1000;
    const burst = new Promise((res) => setTimeout(res, explodeMs));
    try {
      const r = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!r.ok) {
        setMsg("Не удалось сохранить");
        setExploding(false);
        return;
      }
      const d = await r.json();
      if (!d.status.giftSatelliteKey) {
        // Обязательный ключ так и не задан — возвращаем на его шаг (защита, в норме недостижимо).
        setMsg("Нужен обязательный ключ Gift Satellite, чтобы завершить установку");
        setExploding(false);
        goTo(1);
        return;
      }
      const r2 = await fetch("/api/onboarding", { method: "POST" });
      if (!r2.ok) {
        setMsg("Не удалось завершить установку");
        setExploding(false);
        return;
      }
      await burst; // дать осколкам разлететься перед переходом
      router.push(next);
    } finally {
      setBusy(false);
    }
  }

  // Индикатор «02 / 06» для шагов-полей.
  const fieldPos = current.kind === "field" ? FIELD_STEP_INDEXES.indexOf(step) + 1 : 0;
  const fieldTotal = FIELD_STEP_INDEXES.length;

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden px-margin-mobile py-12 md:px-margin-desktop">
      {/* Планета — вне key={step}-контейнера, чтобы жить непрерывно и деформироваться сквозь шаги. */}
      <OnboardingPlanet step={step} total={STEPS.length} exploding={exploding} />
      {/* Атмосфера «Digital Serenity» — только на заставке (на шагах-полях её нет — только планета). */}
      {current.kind === "splash" && <SerenityBackdrop />}
      {/* key={step} → remount → пере-проигрыш анимации входа шага на каждом переходе. */}
      <div key={step} className="wizard-step relative z-10 w-full max-w-lg">
        {current.kind === "splash" && (
          <div className="flex flex-col items-center text-center">
            <WordReveal
              as="h1"
              text="PluTON"
              className="font-headline-lg text-headline-lg font-bold tracking-tighter text-primary"
              startDelay={200}
              stepDelay={90}
              wordDuration={800}
            />
            <WordReveal
              as="p"
              text="Персональный мультимаркетный трекер цен коллекционных Telegram-подарков. Настроим ключи для локальной работы — это займёт минуту."
              className="mt-4 max-w-md text-on-surface-variant"
              startDelay={500}
              stepDelay={70}
              wordDuration={650}
            />
            <button
              onClick={() => goTo(1)}
              style={{ animation: "pl-fade-up 700ms cubic-bezier(0.16,1,0.3,1) 1600ms both" }}
              className="mt-10 flex items-center justify-center gap-2 rounded-lg bg-primary px-10 py-4 font-label-caps text-label-caps uppercase tracking-widest text-on-primary transition-opacity hover:opacity-90"
            >
              <Rocket size={18} /> Старт
            </button>
          </div>
        )}

        {current.kind === "field" && (
          <div>
            <div className="mb-6 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-widest text-on-surface-variant">
                {String(fieldPos).padStart(2, "0")} / {String(fieldTotal).padStart(2, "0")}
              </span>
              {current.required ? (
                <span className="font-mono text-[10px] uppercase tracking-widest text-primary">обязательно</span>
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant">
                  необязательно
                </span>
              )}
            </div>

            <div className="mb-1 flex items-center gap-2">
              <label className="font-headline-md text-headline-md text-primary">{current.label}</label>
              {(savedStatus[current.field] || (current.field === "telegramSession" && tgLinked)) && (
                <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-700 dark:text-emerald-400">
                  <Check size={12} /> настроено
                </span>
              )}
            </div>
            <p className="mb-4 text-body-md text-on-surface-variant">{current.hint}</p>

            {current.multiline ? (
              <textarea
                autoFocus
                value={values[current.field] ?? ""}
                onChange={(e) => setValue(current.field, e.target.value)}
                placeholder={savedStatus[current.field] ? "•••••• сохранено — оставь пустым, чтобы не менять" : ""}
                rows={3}
                className={inputClass}
              />
            ) : (
              <input
                autoFocus
                type="password"
                value={values[current.field] ?? ""}
                onChange={(e) => setValue(current.field, e.target.value)}
                placeholder={savedStatus[current.field] ? "•••••• сохранено — оставь пустым, чтобы не менять" : ""}
                className={inputClass}
              />
            )}

            {current.field === "telegramSession" &&
              (showTgLogin ? (
                <TelegramLoginDialog
                  apiId={values.telegramApiId?.trim() || undefined}
                  apiHash={values.telegramApiHash?.trim() || undefined}
                  onClose={() => setShowTgLogin(false)}
                  onLinked={() => {
                    setTgLinked(true);
                    setValues((s) => ({ ...s, telegramSession: "" }));
                  }}
                />
              ) : (
                <button
                  onClick={() => setShowTgLogin(true)}
                  disabled={!apiCredsReady}
                  title={apiCredsReady ? undefined : "Сначала заполни API ID и API Hash"}
                  className="mt-3 flex items-center gap-2 rounded border border-outline-variant px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-on-surface-variant transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-outline-variant disabled:hover:text-on-surface-variant"
                >
                  <LogIn size={14} /> {tgLinked ? "Переподключить" : "Получить"}
                </button>
              ))}

            <div className="mt-8 flex items-center gap-3">
              <button
                onClick={() => goTo(step - 1)}
                className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-widest text-on-surface-variant transition-colors hover:text-primary"
              >
                <ArrowLeft size={14} /> Назад
              </button>
              <div className="flex-grow" />
              {!current.required && (
                <button
                  onClick={() => skipField(current.field)}
                  className="flex items-center gap-2 rounded-lg border border-outline-variant px-5 py-3 font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant transition-opacity hover:opacity-90"
                >
                  <SkipForward size={16} /> Skip
                </button>
              )}
              <button
                onClick={() => goTo(step + 1)}
                disabled={current.required && !savedStatus[current.field] && !values[current.field]?.trim()}
                className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-label-caps text-label-caps uppercase tracking-widest text-on-primary transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Next <ArrowRight size={16} />
              </button>
            </div>
            {current.required && !savedStatus[current.field] && !values[current.field]?.trim() && (
              <p className="mt-3 font-mono text-[10px] text-on-surface-variant">
                Заполни ключ, чтобы продолжить — этот шаг пропустить нельзя.
              </p>
            )}
          </div>
        )}

        {current.kind === "finish" && (
          <div className="flex flex-col items-center text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary">
              <Check size={28} />
            </span>
            <h2 className="mt-6 font-headline-md text-headline-md text-primary">Всё готово</h2>
            <p className="mt-2 max-w-md text-on-surface-variant">
              Ключи будут сохранены зашифрованными в базе. Незаполненное можно донастроить позже в
              «Настройках». Нажми «Финиш», чтобы перейти в приложение.
            </p>
            <div className="mt-10 flex items-center gap-3">
              <button
                onClick={() => goTo(step - 1)}
                className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-widest text-on-surface-variant transition-colors hover:text-primary"
              >
                <ArrowLeft size={14} /> Назад
              </button>
              <button
                onClick={onFinish}
                disabled={busy}
                className="flex items-center justify-center gap-2 rounded-lg bg-primary px-10 py-4 font-label-caps text-label-caps uppercase tracking-widest text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <KeyRound size={18} /> {busy ? "Сохраняю…" : "Финиш"}
              </button>
            </div>
          </div>
        )}

        {msg && <p className="mt-6 text-center font-mono text-[11px] text-on-surface-variant">{msg}</p>}
      </div>
    </div>
  );
}
