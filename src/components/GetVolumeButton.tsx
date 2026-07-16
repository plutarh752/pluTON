"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useRunPoller } from "./useRunPoller";
import { RunProgress } from "./RunProgress";

// Кнопка «Получить объём» + дропдаун периода (24ч/7д/30д). Механика поллинга/прогресса/устойчивости —
// общий useRunPoller (как у GetPricesButton). Период выбирается ДО запуска: его смена меняет URL
// (?period=), сервер перечитывает последний прогон и cooldown для этого периода.
const PERIODS: { value: string; label: string }[] = [
  { value: "24h", label: "24 часа" },
  { value: "7d", label: "7 дней" },
  { value: "30d", label: "30 дней" },
];

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}м ${s}с` : `${s}с`;
}

export function GetVolumeButton({
  period,
  cooldownLeft,
  running,
  configured = true,
}: {
  period: string;
  cooldownLeft: number;
  running: boolean;
  configured?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const { active, progress, log, left, setLeft, begin } = useRunPoller(
    `/api/volume?period=${period}`,
    running,
    cooldownLeft
  );

  function changePeriod(p: string) {
    if (p === period || active) return;
    router.push(`/volumes?period=${p}`);
  }

  async function trigger() {
    setBusy(true);
    setMsg("Запуск…");
    try {
      const r = await fetch(`/api/volume?period=${period}`, { method: "POST" });
      const d = await r.json();
      if (r.status === 202) {
        setMsg("");
        begin();
      } else if (d.error === "cooldown") {
        setLeft(d.secondsLeft);
        setMsg("Ещё идёт cooldown");
      } else if (d.error === "already_running") {
        setMsg("");
        begin();
      } else if (d.error === "telegram_not_configured") {
        setMsg("Telegram не настроен — заполни ключи в Настройках");
      } else {
        setMsg("Ошибка запуска");
      }
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || active || left > 0 || !configured;
  const label = active ? "Сбор идёт…" : left > 0 ? `Получить объём (через ${fmt(left)})` : "Получить объём";

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-3">
        {/* Дропдаун периода РЯДОМ с кнопкой — выбор ДО запуска. */}
        <div className="flex overflow-hidden rounded border border-outline-variant">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => changePeriod(p.value)}
              disabled={active}
              className={
                "px-4 py-3 font-mono text-[11px] uppercase tracking-widest transition-colors disabled:opacity-40 " +
                (p.value === period
                  ? "bg-surface-container-highest text-primary"
                  : "text-on-surface-variant hover:bg-surface-container")
              }
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          onClick={trigger}
          disabled={disabled}
          className="flex items-center gap-3 rounded bg-primary px-10 py-4 text-label-md uppercase tracking-widest text-on-primary transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
        >
          <RefreshCw size={18} className={active ? "animate-spin" : ""} />
          {label}
        </button>
      </div>
      {active && progress && (
        <RunProgress phase={progress.phase} done={progress.done} total={progress.total} log={log} />
      )}
      {msg && !active && <span className="font-mono text-[11px] text-on-surface-variant">{msg}</span>}
    </div>
  );
}
