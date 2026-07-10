// Always-on воркер для Railway: принимает HTTP-сигнал от веба (Vercel) и запускает скан/пересчёт.
// Это прод-замена локального spawn из /api/scan. Веб на Vercel serverless не держит долгий скан (~7 мин),
// поэтому скан-джоба живёт здесь. Сам скан идёт отдельным процессом (spawn) — HTTP остаётся отзывчивым
// для healthcheck, пока скан работает. Это НЕ фоновый поллинг: джоба стартует только по сигналу.
import "dotenv/config";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT ?? 8080);
const TOKEN = process.env.WORKER_TOKEN ?? "";

const SCRIPT: Record<string, string> = {
  scan: "worker/scan.ts",
  prices: "worker/prices.ts",
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  // Railway healthcheck.
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }

  // Триггер джобы: POST /run?job=scan|rescore  (Authorization: Bearer WORKER_TOKEN)
  if (req.method === "POST" && url.pathname === "/run") {
    if (!TOKEN || req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    const job = url.searchParams.get("job") ?? "scan";
    const script = SCRIPT[job];
    if (!script) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "bad_job" }));
      return;
    }
    // Concurrency-guard'ы (cooldown, running, rescore_state) уже в вызывающих /api/*-роутах.
    const child = spawn("npx", ["tsx", script], { cwd: process.cwd(), detached: true, stdio: "inherit", env: process.env });
    child.unref();
    console.log(`[worker] triggered ${job}`);
    res.writeHead(202, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, job }));
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(PORT, () => console.log(`[worker] trigger server listening on :${PORT}`));
