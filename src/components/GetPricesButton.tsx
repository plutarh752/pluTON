"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  const stopPolling = useCallback(() => {
    if (poll.current) {
      clearInterval(poll.current);
      poll.current = undefined;
    }
  }, []);

  // Один опрос статуса + refresh витрины. Возвращает, идёт ли ещё прогон.
  const checkStatus = useCallback(async (): Promise<boolean> => {
    try {
      const s = await (await fetch("/api/prices")).json();
      router.refresh();
      if (!s.running) {
        stopPolling();
        setLeft(s.cooldownLeft ?? 0);
      }
      return !!s.running;
    } catch {
      return false;
    }
  }, [router, stopPolling]);

  const ensurePolling = useCallback(() => {
    if (!poll.current) poll.current = setInterval(checkStatus, 3000);
  }, [checkStatus]);

  // Пока идёт прогон: сразу один опрос (не ждём 3с) + интервальный поллинг. Гасим при размонтировании.
  useEffect(() => {
    if (!running) return;
    checkStatus();
    ensurePolling();
    return stopPolling;
  }, [running, checkStatus, ensurePolling, stopPolling]);

  // Устойчивость к смене вкладки/навигации: при возврате на видимую страницу немедленно берём свежий
  // статус (воркер всё это время работал сам как локальный процесс) и, если прогон ещё идёт,
  // возобновляем поллинг — не полагаемся только на remount. В фоне (hidden) интервал гасим.
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
