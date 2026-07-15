import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { triggerWorker } from "@/lib/trigger";
import { freshVolumeRun } from "@/lib/volumeRun";
import { isTelegramConfigured } from "@/lib/secrets";

// Кнопка «Получить объём» (вкладка «Объёмы»): триггер прогона Portals + статус для поллинга.
// Аналог /api/prices, но с окном периода (24h|7d|30d), выбираемым ДО запуска.
export const dynamic = "force-dynamic";

const PERIODS = new Set(["24h", "7d", "30d"]);
function parsePeriod(req: NextRequest): string {
  const p = req.nextUrl.searchParams.get("period") ?? "24h";
  return PERIODS.has(p) ? p : "24h";
}

async function cooldownLeftSeconds(period: string): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key: "volume" } });
  const cooldownMin = (s?.value as { cooldown_minutes?: number } | null)?.cooldown_minutes ?? 15;
  const lastOk = await prisma.volumeRun.findFirst({
    where: { status: { in: ["success", "partial"] }, period },
    orderBy: { startedAt: "desc" },
  });
  if (!lastOk) return 0;
  const ageMs = Date.now() - lastOk.startedAt.getTime();
  return Math.max(0, Math.ceil((cooldownMin * 60_000 - ageMs) / 1000));
}

export async function GET(req: NextRequest) {
  const period = parsePeriod(req);
  const running = await freshVolumeRun();
  const last = await prisma.volumeRun.findFirst({ where: { period }, orderBy: { startedAt: "desc" } });
  return NextResponse.json({
    period,
    running: !!running,
    runningRunId: running?.id ?? null,
    runningPeriod: running?.period ?? null,
    lastRunId: last?.id ?? null,
    lastStatus: last?.status ?? null,
    authOk: last?.authOk ?? null,
    cooldownLeft: await cooldownLeftSeconds(period),
  });
}

export async function POST(req: NextRequest) {
  const period = parsePeriod(req);

  if (!(await isTelegramConfigured())) {
    return NextResponse.json({ error: "telegram_not_configured" }, { status: 409 });
  }

  // TOCTOU-fix (инвариант 4): строку прогона создаём СИНХРОННО до спавна воркера — второй быстрый POST
  // увидит running и получит 409. Running-guard глобальный (один прогон Portals за раз — щадим маркет).
  const running = await freshVolumeRun();
  if (running) return NextResponse.json({ error: "already_running", runId: running.id }, { status: 409 });

  const left = await cooldownLeftSeconds(period);
  if (left > 0) return NextResponse.json({ error: "cooldown", secondsLeft: left }, { status: 409 });

  const run = await prisma.volumeRun.create({ data: { status: "running", trigger: "api", period } });

  try {
    await triggerWorker("volume", run.id, period);
  } catch {
    await prisma.volumeRun.update({
      where: { id: run.id },
      data: { status: "failed", finishedAt: new Date(), error: "trigger_failed" },
    });
    return NextResponse.json({ error: "trigger_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, runId: run.id, period }, { status: 202 });
}
