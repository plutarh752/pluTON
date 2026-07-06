import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { triggerWorker } from "@/lib/trigger";

// Экран 1: триггер и статус скана.
export const dynamic = "force-dynamic";

async function cooldownLeftSeconds(): Promise<number> {
  const scanS = await prisma.setting.findUnique({ where: { key: "scan" } });
  const cooldownMin = (scanS?.value as { cooldown_minutes?: number } | null)?.cooldown_minutes ?? 15;
  const lastSuccess = await prisma.scan.findFirst({ where: { status: "success" }, orderBy: { startedAt: "desc" } });
  if (!lastSuccess) return 0;
  const ageMs = Date.now() - lastSuccess.startedAt.getTime();
  return Math.max(0, Math.ceil((cooldownMin * 60_000 - ageMs) / 1000));
}

export async function GET() {
  const running = await prisma.scan.findFirst({ where: { status: "running" }, orderBy: { startedAt: "desc" } });
  const last = await prisma.scan.findFirst({ orderBy: { startedAt: "desc" } });
  return NextResponse.json({
    running: !!running,
    runningScanId: running?.id ?? null,
    lastScanId: last?.id ?? null,
    cooldownLeft: await cooldownLeftSeconds(),
  });
}

export async function POST() {
  const running = await prisma.scan.findFirst({ where: { status: "running" }, orderBy: { startedAt: "desc" } });
  if (running) return NextResponse.json({ error: "already_running", scanId: running.id }, { status: 409 });

  const left = await cooldownLeftSeconds();
  if (left > 0) return NextResponse.json({ error: "cooldown", secondsLeft: left }, { status: 409 });

  // Прод: HTTP-сигнал воркеру на Railway; локально: spawn (см. src/lib/trigger.ts).
  try {
    await triggerWorker("scan");
  } catch {
    return NextResponse.json({ error: "trigger_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true }, { status: 202 });
}
