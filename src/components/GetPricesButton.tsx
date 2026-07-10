"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

// Кнопка «Получить цены»: триггерит воркер-прогон и поллит статус (та же механика, что «Скан»).
function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}м ${s}с` : `${s}с`;
}

export function GetPricesButton({ cooldownLeft, running }: { cooldownLeft: number; running: boolean }) {
  const router = useRouter();
  const [left, setLeft] = useState(cooldownLeft);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const poll = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => setLeft(cooldownLeft), [cooldownLeft]);
  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [left]);

  useEffect(() => {
    if (!running) return;
    poll.current = setInterval(async () => {
      const s = await (await fetch("/api/prices")).json();
      router.refresh();
      if (!s.running) {
        clearInterval(poll.current);
        setLeft(s.cooldownLeft ?? 0);
      }
    }, 3000);
    return () => clearInterval(poll.current);
  }, [running, router]);

  async function trigger() {
    setBusy(true);
    setMsg("Запуск…");
    try {
      const r = await fetch("/api/prices", { method: "POST" });
      const d = await r.json();
      if (r.status === 202) {
        setMsg("Сбор запущен");
        setTimeout(() => router.refresh(), 1500);
      } else if (d.error === "cooldown") {
        setLeft(d.secondsLeft);
        setMsg("Ещё идёт cooldown");
      } else if (d.error === "already_running") {
        setMsg("Сбор уже идёт");
      } else {
        setMsg("Ошибка запуска");
      }
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || running || left > 0;
  const label = running ? "Сбор идёт…" : left > 0 ? `Получить цены (через ${fmt(left)})` : "Получить цены";
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={trigger}
        disabled={disabled}
        className="flex items-center gap-3 rounded bg-primary px-12 py-4 text-label-md uppercase tracking-widest text-on-primary transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
      >
        <RefreshCw size={18} className={running ? "animate-spin" : ""} />
        {label}
      </button>
      {msg && <span className="font-mono text-[11px] text-on-surface-variant">{msg}</span>}
    </div>
  );
}
