import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { triggerWorker } from "@/lib/trigger";

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
  const running = await prisma.priceRun.findFirst({ where: { status: "running" }, orderBy: { startedAt: "desc" } });
  const last = await prisma.priceRun.findFirst({ orderBy: { startedAt: "desc" } });
  return NextResponse.json({
    running: !!running,
    runningRunId: running?.id ?? null,
    lastRunId: last?.id ?? null,
    lastStatus: last?.status ?? null,
    marketStatus: last?.marketStatus ?? null,
    cooldownLeft: await cooldownLeftSeconds(),
  });
}

export async function POST() {
  const running = await prisma.priceRun.findFirst({ where: { status: "running" }, orderBy: { startedAt: "desc" } });
  if (running) return NextResponse.json({ error: "already_running", runId: running.id }, { status: 409 });

  const left = await cooldownLeftSeconds();
  if (left > 0) return NextResponse.json({ error: "cooldown", secondsLeft: left }, { status: 409 });

  try {
    await triggerWorker("prices");
  } catch {
    return NextResponse.json({ error: "trigger_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true }, { status: 202 });
}
