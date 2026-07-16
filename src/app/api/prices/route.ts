import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { triggerWorker } from "@/lib/trigger";
import { freshRunningRun } from "@/lib/priceRun";
import { getRunProgress } from "@/lib/progress";

// Кнопка «Получить цены»: триггер прогона + статус для поллинга (аналог /api/scan).
export const dynamic = "force-dynamic";

async function cooldownLeftSeconds(): Promise<number> {
  const pricesS = await prisma.setting.findUnique({ where: { key: "prices" } });
  const cooldownMin = (pricesS?.value as { cooldown_minutes?: number } | null)?.cooldown_minutes ?? 3;
  const lastOk = await prisma.priceRun.findFirst({ where: { status: "success" }, orderBy: { startedAt: "desc" } });
  if (!lastOk) return 0;
  const ageMs = Date.now() - lastOk.startedAt.getTime();
  return Math.max(0, Math.ceil((cooldownMin * 60_000 - ageMs) / 1000));
}

export async function GET() {
  const running = await freshRunningRun();
  const last = await prisma.priceRun.findFirst({ orderBy: { startedAt: "desc" } });
  // Прогресс отдаём только для ТЕКУЩЕГО живого прогона (гейт по runId) — чтобы не показать хвост прошлого.
  let progress = null;
  if (running) {
    const p = await getRunProgress("prices");
    if (p && p.runId === running.id) progress = p;
  }
  return NextResponse.json({
    running: !!running,
    runningRunId: running?.id ?? null,
    lastRunId: last?.id ?? null,
    lastStatus: last?.status ?? null,
    marketStatus: last?.marketStatus ?? null,
    progress,
    cooldownLeft: await cooldownLeftSeconds(),
  });
}

export async function POST() {
  // TOCTOU-fix: строку прогона создаём здесь СИНХРОННО до спавна воркера, поэтому второй быстрый POST
  // увидит running и получит 409 (раньше строку создавал воркер → два POST'а спавнили два прогона).
  const running = await freshRunningRun();
  if (running) return NextResponse.json({ error: "already_running", runId: running.id }, { status: 409 });

  const left = await cooldownLeftSeconds();
  if (left > 0) return NextResponse.json({ error: "cooldown", secondsLeft: left }, { status: 409 });

  const presetsCount = await prisma.preset.count();
  const run = await prisma.priceRun.create({
    data: { status: "running", trigger: "api", presetsCount },
  });

  try {
    await triggerWorker("prices", run.id);
  } catch {
    // триггер не прошёл — закрываем строку, чтобы она не блокировала следующий запуск.
    await prisma.priceRun.update({
      where: { id: run.id },
      data: { status: "failed", finishedAt: new Date(), error: "trigger_failed" },
    });
    return NextResponse.json({ error: "trigger_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, runId: run.id }, { status: 202 });
}
