import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { triggerWorker } from "@/lib/trigger";

// Экран 5: пересчёт скоринга из БД (без tonapi) по текущим сохранённым настройкам.
export const dynamic = "force-dynamic";

const STALE_MS = 10 * 60_000; // «running» старше 10 мин считаем залипшим (процесс умер)

type RescoreState = { status?: string; startedAt?: string; finishedAt?: string; totalListings?: number; error?: string } | null;

async function readState(): Promise<RescoreState> {
  const s = await prisma.setting.findUnique({ where: { key: "rescore_state" } });
  return (s?.value as RescoreState) ?? null;
}

function isRunning(st: RescoreState): boolean {
  if (!st || st.status !== "running") return false;
  const started = st.startedAt ? Date.parse(st.startedAt) : 0;
  return Date.now() - started < STALE_MS;
}

export async function GET() {
  const st = await readState();
  return NextResponse.json({ running: isRunning(st), state: st });
}

export async function POST() {
  const st = await readState();
  if (isRunning(st)) return NextResponse.json({ error: "already_running" }, { status: 409 });

  // Помечаем running СИНХРОННО до spawn — иначе быстрый (5с) DB-only пересчёт создаёт гонку:
  // второй POST успевает проскочить, пока воркер ещё не записал свой статус. Воркер затем
  // перезапишет running→success своими данными.
  await prisma.setting.upsert({
    where: { key: "rescore_state" },
    create: { key: "rescore_state", value: { status: "running", startedAt: new Date().toISOString() } },
    update: { value: { status: "running", startedAt: new Date().toISOString() } },
  });

  // Прод: HTTP-сигнал воркеру на Railway; локально: spawn (см. src/lib/trigger.ts).
  try {
    await triggerWorker("rescore");
  } catch {
    return NextResponse.json({ error: "trigger_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true }, { status: 202 });
}
