import { spawn } from "node:child_process";

// Веб-триггер запускает воркер локальным detached-процессом — не блокирует HTTP-запрос.
// Это НЕ фоновый поллинг: джоба стартует только по сигналу (кнопка «Получить цены»/«Получить объём»).
export type Job = "scan" | "prices" | "volume";

const SCRIPT: Record<Job, string> = {
  scan: "worker/scan.ts",
  prices: "worker/prices.ts",
  volume: "worker/volume.ts",
};

/**
 * `runId` — если роут уже создал строку прогона (PriceRun/Scan/VolumeRun) синхронно для
 * concurrency-guard'а, прокидываем её id воркеру, чтобы он взял ЕЁ, а не создавал вторую
 * (иначе TOCTOU-дубль прогона).
 * `period` — окно объёма (24h|7d|30d) для job="volume".
 */
export async function triggerWorker(job: Job, runId?: number, period?: string): Promise<boolean> {
  const args = [
    "tsx",
    SCRIPT[job],
    ...(runId != null ? [`--run-id=${runId}`] : []),
    ...(period ? [`--period=${period}`] : []),
  ];
  const child = spawn("npx", args, {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  return true;
}
