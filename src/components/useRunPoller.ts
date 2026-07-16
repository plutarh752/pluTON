"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RunProgressData } from "./RunProgress";

// Общий поллер прогонов «Получить цены»/«Получить объём»: опрашивает статус-эндпоинт, ведёт живой
// прогресс (для RunProgress) + консоль-лог, cooldown-обратный отсчёт и refresh страницы ПРИ ЗАВЕРШЕНИИ
// (а не на каждый тик — данные витрины/таблицы появляются только в конце). Устойчив к смене вкладки
// (visibilitychange): воркер работает сам, при возврате берём свежий статус и, если ещё идёт, продолжаем.

const MAX_LOG = 7; // сколько последних строк лога держим (верхние затухают под mask в RunProgress)

export function useRunPoller(statusUrl: string, initialRunning: boolean, initialCooldown: number, pollMs = 1200) {
  const router = useRouter();
  const [active, setActive] = useState(initialRunning);
  const [progress, setProgress] = useState<RunProgressData | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [left, setLeft] = useState(initialCooldown);
  const poll = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const wasActive = useRef(initialRunning); // был ли прогон живым → нужен refresh при завершении

  useEffect(() => setLeft(initialCooldown), [initialCooldown]);
  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [left]);

  const stop = useCallback(() => {
    if (poll.current) {
      clearInterval(poll.current);
      poll.current = undefined;
    }
  }, []);

  const appendLog = useCallback((label?: string) => {
    const l = (label ?? "").trim();
    if (!l || l === "…") return;
    setLog((prev) => (prev[prev.length - 1] === l ? prev : [...prev, l].slice(-MAX_LOG)));
  }, []);

  // Один опрос статуса. Возвращает, идёт ли ещё прогон.
  const check = useCallback(async (): Promise<boolean> => {
    try {
      const s = await (await fetch(statusUrl)).json();
      if (s.progress) {
        setProgress(s.progress as RunProgressData);
        appendLog((s.progress as RunProgressData).label);
      }
      if (s.running) {
        wasActive.current = true;
        setActive(true);
        return true;
      }
      // прогон завершён
      stop();
      setActive(false);
      setProgress(null);
      setLog([]);
      setLeft(s.cooldownLeft ?? 0);
      if (wasActive.current) {
        wasActive.current = false;
        router.refresh(); // подтянуть свежую витрину/таблицу и cooldown
      }
      return false;
    } catch {
      return false;
    }
  }, [statusUrl, appendLog, stop, router]);

  const ensurePolling = useCallback(() => {
    if (!poll.current) poll.current = setInterval(check, pollMs);
  }, [check, pollMs]);

  // Пока active: сразу опрос (не ждём интервал) + поллинг. Гасим при размонтировании/смене active.
  useEffect(() => {
    if (!active) return;
    check();
    ensurePolling();
    return stop;
  }, [active, check, ensurePolling, stop]);

  // Сервер сказал «идёт» (проп изменился на true после refresh) — включаем active.
  useEffect(() => {
    if (initialRunning) {
      wasActive.current = true;
      setActive(true);
    }
  }, [initialRunning]);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible") {
        check().then((stillRunning) => {
          if (stillRunning) ensurePolling();
        });
      } else {
        stop();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [check, ensurePolling, stop]);

  // Локальный старт сразу после POST 202 — не ждём серверный refresh, показываем прогресс мгновенно.
  const begin = useCallback(() => {
    wasActive.current = true;
    setLog([]);
    setProgress(null);
    setActive(true);
    ensurePolling();
  }, [ensurePolling]);

  return { active, progress, log, left, setLeft, begin };
}
