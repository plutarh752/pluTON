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

/**
 * Возвращает true, если триггер принят (202) или воркер уже занят (409 — это не ошибка вызова).
 * `runId` — если роут уже создал строку прогона (PriceRun/Scan) синхронно для concurrency-guard'а,
 * прокидываем её id воркеру, чтобы он взял ЕЁ, а не создавал вторую (иначе TOCTOU-дубль прогона).
 */
export async function triggerWorker(job: Job, runId?: number): Promise<boolean> {
  const workerUrl = process.env.WORKER_URL;

  if (workerUrl) {
    const runParam = runId != null ? `&runId=${runId}` : "";
    const res = await fetch(`${workerUrl.replace(/\/$/, "")}/run?job=${job}${runParam}`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.WORKER_TOKEN ?? ""}` },
    });
    if (res.ok || res.status === 409) return true;
    throw new Error(`worker trigger failed: HTTP ${res.status}`);
  }

  // Локально: detached-процесс, не блокирует запрос и не упирается в лимит времени serverless.
  const args = ["tsx", SCRIPT[job], ...(runId != null ? [`--run-id=${runId}`] : [])];
  const child = spawn("npx", args, {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  return true;
}
