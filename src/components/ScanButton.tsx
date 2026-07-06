"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}м ${s}с` : `${s}с`;
}

export function ScanButton({ cooldownLeft, running }: { cooldownLeft: number; running: boolean }) {
  const router = useRouter();
  const [left, setLeft] = useState(cooldownLeft);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const poll = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // локальный отсчёт cooldown
  useEffect(() => setLeft(cooldownLeft), [cooldownLeft]);
  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [left]);

  // пока идёт скан — опрашиваем статус и обновляем страницу
  useEffect(() => {
    if (!running) return;
    poll.current = setInterval(async () => {
      const s = await (await fetch("/api/scan")).json();
      router.refresh();
      if (!s.running) {
        clearInterval(poll.current);
        setLeft(s.cooldownLeft);
      }
    }, 3000);
    return () => clearInterval(poll.current);
  }, [running, router]);

  async function trigger() {
    setBusy(true);
    setMsg("Запуск…");
    try {
      const r = await fetch("/api/scan", { method: "POST" });
      const d = await r.json();
      if (r.status === 202) {
        setMsg("Скан запущен");
        setTimeout(() => router.refresh(), 1500);
      } else if (d.error === "cooldown") {
        setLeft(d.secondsLeft);
        setMsg("Ещё идёт cooldown");
      } else if (d.error === "already_running") {
        setMsg("Скан уже идёт");
      } else {
        setMsg("Ошибка запуска");
      }
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || running || left > 0;
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={trigger}
        disabled={disabled}
        className="rounded-lg bg-neutral-900 px-5 py-2.5 font-medium text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {running ? "Скан идёт…" : left > 0 ? `Скан (через ${fmt(left)})` : "Скан"}
      </button>
      {msg && <span className="text-sm text-neutral-500">{msg}</span>}
    </div>
  );
}
