"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRunPoller } from "./useRunPoller";
import { RunProgress } from "./RunProgress";

// Кнопка «Получить цены»: триггерит воркер-прогон и поллит статус + живой прогресс (см. useRunPoller).
function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}м ${s}с` : `${s}с`;
}

export function GetPricesButton({ cooldownLeft, running }: { cooldownLeft: number; running: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const { active, progress, log, left, setLeft, begin } = useRunPoller("/api/prices", running, cooldownLeft);

  async function trigger() {
    setBusy(true);
    setMsg("Запуск…");
    try {
      const r = await fetch("/api/prices", { method: "POST" });
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
      } else {
        setMsg("Ошибка запуска");
      }
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || active || left > 0;
  const label = active ? "Сбор идёт…" : left > 0 ? `Получить цены (через ${fmt(left)})` : "Получить цены";
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <button
        onClick={trigger}
        disabled={disabled}
        className="flex items-center gap-3 rounded bg-primary px-12 py-4 text-label-md uppercase tracking-widest text-on-primary transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
      >
        <RefreshCw size={18} className={active ? "animate-spin" : ""} />
        {label}
      </button>
      {active && progress && (
        <RunProgress phase={progress.phase} done={progress.done} total={progress.total} log={log} />
      )}
      {msg && !active && <span className="font-mono text-[11px] text-on-surface-variant">{msg}</span>}
    </div>
  );
}
