"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

// Кнопка «Получить объём» + дропдаун периода (24ч/7д/30д). Механика поллинга/устойчивости к смене
// вкладки — как у GetPricesButton. Период выбирается ДО запуска: его смена меняет URL (?period=),
// сервер перечитывает последний прогон и cooldown для этого периода.
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

  const stopPolling = useCallback(() => {
    if (poll.current) {
      clearInterval(poll.current);
      poll.current = undefined;
    }
  }, []);

  const checkStatus = useCallback(async (): Promise<boolean> => {
    try {
      const s = await (await fetch(`/api/volume?period=${period}`)).json();
      router.refresh();
      if (!s.running) {
        stopPolling();
        setLeft(s.cooldownLeft ?? 0);
      }
      return !!s.running;
    } catch {
      return false;
    }
  }, [router, stopPolling, period]);

  const ensurePolling = useCallback(() => {
    if (!poll.current) poll.current = setInterval(checkStatus, 3000);
  }, [checkStatus]);

  useEffect(() => {
    if (!running) return;
    checkStatus();
    ensurePolling();
    return stopPolling;
  }, [running, checkStatus, ensurePolling, stopPolling]);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible") {
        checkStatus().then((stillRunning) => {
          if (stillRunning) ensurePolling();
        });
      } else {
        stopPolling();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [checkStatus, ensurePolling, stopPolling]);

  function changePeriod(p: string) {
    if (p === period || running) return;
    router.push(`/volumes?period=${p}`);
  }

  async function trigger() {
    setBusy(true);
    setMsg("Запуск…");
    try {
      const r = await fetch(`/api/volume?period=${period}`, { method: "POST" });
      const d = await r.json();
      if (r.status === 202) {
        setMsg("Сбор объёма запущен");
        setTimeout(() => router.refresh(), 1500);
      } else if (d.error === "cooldown") {
        setLeft(d.secondsLeft);
        setMsg("Ещё идёт cooldown");
      } else if (d.error === "already_running") {
        setMsg("Прогон уже идёт");
      } else if (d.error === "telegram_not_configured") {
        setMsg("Telegram не настроен — заполни ключи в Настройках");
      } else {
        setMsg("Ошибка запуска");
      }
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || running || left > 0 || !configured;
  const label = running ? "Сбор идёт…" : left > 0 ? `Получить объём (через ${fmt(left)})` : "Получить объём";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-3">
        {/* Дропдаун периода РЯДОМ с кнопкой — выбор ДО запуска. */}
        <div className="flex overflow-hidden rounded border border-outline-variant">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => changePeriod(p.value)}
              disabled={running}
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
          <RefreshCw size={18} className={running ? "animate-spin" : ""} />
          {label}
        </button>
      </div>
      {msg && <span className="font-mono text-[11px] text-on-surface-variant">{msg}</span>}
    </div>
  );
}
