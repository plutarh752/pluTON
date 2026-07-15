import { spawn } from "node:child_process";
import path from "node:path";
import { getTelegramCreds } from "./secrets";

// Мост Node → Python-сайдкар Portals (worker/portals_fetch.py) для вкладки «Объёмы».
// Portals — единственный источник РЕАЛЬНОГО объёма/продаж, но за Cloudflare + истекающим tma-токеном;
// вся эта грязь изолирована в Python (portalsmp + Pyrogram). Здесь — только спавн, JSON-парсинг и
// health-check, который ГРОМКО падает в терминал, если Telegram-авторизация протухла (требование задачи).
//
// Схема ответов Portals из этой среды не проб'илась (Cloudflare + auth) — поля коллекций/продаж парсим
// ЗАЩИТНО по кандидатам ключей (как giftSatellite). Первый реальный прогон покажет фактическую форму:
// worker/volume.ts логирует `sample` первой продажи — при расхождении поправить кандидаты здесь/в питоне.

const PYTHON_BIN = process.env.PYTHON_BIN ?? "python3";
const SIDECAR = path.join(process.cwd(), "worker", "portals_fetch.py");

/** Спавнит python-сайдкар, собирает stdout, парсит JSON. Ненулевой exit → reject со stderr-текстом. */
export async function runPortalsSidecar<T = unknown>(args: string[], timeoutMs = 180_000): Promise<T> {
  // Telegram-креды теперь в БД (src/lib/secrets.ts), не в env — подмешиваем их в env дочернего
  // процесса на спавне. Python-сайдкар не меняется: как читал os.environ.get(...), так и читает.
  const creds = await getTelegramCreds();
  if (!creds.apiId || !creds.apiHash || !creds.session) {
    throw new Error("telegram_not_configured: заполни Telegram API ID/Hash/Session в Настройках (/settings)");
  }
  const env = {
    ...process.env,
    TELEGRAM_API_ID: creds.apiId,
    TELEGRAM_API_HASH: creds.apiHash,
    TELEGRAM_SESSION: creds.session,
  };
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [SIDECAR, ...args], { env });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`portals sidecar timeout (${timeoutMs}ms) [${args.join(" ")}]`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`portals sidecar spawn failed (${PYTHON_BIN}): ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(err.trim() || `portals sidecar exited ${code}`));
      try {
        resolve(JSON.parse(out) as T);
      } catch {
        reject(new Error(`portals sidecar bad JSON: ${out.slice(0, 300)}`));
      }
    });
  });
}

/** Health-check Portals-авторизации: громкий понятный отказ в терминал, если tma протух. Бросает при провале. */
export async function assertPortalsAuth(): Promise<void> {
  try {
    await runPortalsSidecar<{ ok: boolean }>(["--health"], 90_000);
    console.log("✅ Portals auth OK");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const bar = "═".repeat(72);
    if (msg.startsWith("telegram_not_configured")) {
      console.error(
        `\n${bar}\n⚠ TELEGRAM НЕ НАСТРОЕН — заполни API ID/Hash/Session в /settings.\n` +
          `   Session сгенерируй локально: npm run portals:login\n${bar}\n`
      );
      throw new Error(msg);
    }
    console.error(
      `\n${bar}\n❌ PORTALS AUTH DEAD — обнови Telegram-сессию.\n` +
        `   1) npm run portals:login → вставь новую сессию в /settings (Telegram Session)\n` +
        `   2) перезапусти воркер / прогон «Получить объём»\n` +
        `   Причина: ${msg}\n${bar}\n`
    );
    throw new Error(`portals_auth_dead: ${msg}`);
  }
}

// ───────────────────────────── типы + защитный парсинг ─────────────────────────────

export interface PortalsSale {
  priceTon: number;
  model: string | null;
  backdrop: string | null;
  ts: string | null; // ISO
}

// Одна коллекция из режима `--run`: нормализованные floor/24ч-объём (сайдкар парсит защитно) + её продажи
// за окно периода. `capped` → пагинация не дошла до границы окна; `budgetSkipped` → до коллекции не дошёл
// общий бюджет времени прогона. Оба означают неполноту → isPartial в воркере.
export interface PortalsRunCollection {
  name: string;
  floorTon: number | null;
  volume24hTon: number | null;
  sales: PortalsSale[];
  capped: boolean;
  budgetSkipped: boolean;
}
export interface PortalsRun {
  collections: PortalsRunCollection[];
  sample: unknown; // первый raw action — для отладки схемы на первом реальном прогоне
}

/**
 * Основной вызов вкладки «Объёмы»: сайдкар минтит tma ОДИН раз, тянет коллекции Portals и по каждой
 * проходит sales-feed за окно периода. Тяжёлый (per-collection пагинация под общим бюджетом времени) —
 * см. worker/portals_fetch.py. Таймаут щедрый: бюджет прогона + запас на минт/сеть.
 */
export async function fetchPortalsRun(period: string, limit = 500): Promise<PortalsRun> {
  const budgetSec = Number(process.env.PORTALS_RUN_BUDGET_SEC ?? 540);
  const timeoutMs = Math.round((budgetSec + 180) * 1000);
  const d = await runPortalsSidecar<PortalsRun>(["--run", "--period", period, "--limit", String(limit)], timeoutMs);
  const collections = Array.isArray(d?.collections)
    ? d.collections.map((c) => ({
        name: String(c?.name ?? ""),
        floorTon: typeof c?.floorTon === "number" ? c.floorTon : null,
        volume24hTon: typeof c?.volume24hTon === "number" ? c.volume24hTon : null,
        sales: Array.isArray(c?.sales) ? c.sales : [],
        capped: !!c?.capped,
        budgetSkipped: !!c?.budgetSkipped,
      }))
    : [];
  return { collections: collections.filter((c) => c.name), sample: d?.sample ?? null };
}
