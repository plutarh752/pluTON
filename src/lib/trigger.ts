import { spawn } from "node:child_process";

// Как веб-триггер запускает воркер:
//   • ПРОД: HTTP-сигнал always-on воркеру (Railway) — POST WORKER_URL/run?job=…
//     (не фоновый поллинг: воркер работает только по этому сигналу; данные всё так же тянутся
//      лишь по кнопке «Скан»).
//   • ЛОКАЛЬНО: spawn отдельного процесса (Vercel-serverless в проде не держит долгий скан,
//     поэтому там воркер живёт на Railway).
export type Job = "scan" | "prices";

const SCRIPT: Record<Job, string> = {
  scan: "worker/scan.ts",
  prices: "worker/prices.ts",
};

/** Возвращает true, если триггер принят (202) или воркер уже занят (409 — это не ошибка вызова). */
export async function triggerWorker(job: Job): Promise<boolean> {
  const workerUrl = process.env.WORKER_URL;

  if (workerUrl) {
    const res = await fetch(`${workerUrl.replace(/\/$/, "")}/run?job=${job}`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.WORKER_TOKEN ?? ""}` },
    });
    if (res.ok || res.status === 409) return true;
    throw new Error(`worker trigger failed: HTTP ${res.status}`);
  }

  // Локально: detached-процесс, не блокирует запрос и не упирается в лимит времени serverless.
  const child = spawn("npx", ["tsx", SCRIPT[job]], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  return true;
}
