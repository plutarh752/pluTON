import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Экран 5: чтение/сохранение настроек (курсы, комиссии, cooldown, веса, пороги, ключ, watchlist).
export const dynamic = "force-dynamic";

// Ключи, которые разрешено писать из UI (rescore_state пишет только воркер).
const KEYS = ["rates", "fees", "scan", "weights", "thresholds", "tonapi", "watchlist"] as const;

export async function GET() {
  const rows = await prisma.setting.findMany();
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key] = r.value;
  return NextResponse.json(out);
}

type WatchItem = { name?: string; slug?: string; address?: string };

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }

  // Последовательные upsert'ы (без интерактивной транзакции — Neon-адаптер гоняет одиночные
  // запросы по HTTP/fetch; upsert компилируется в один INSERT..ON CONFLICT). См. CLAUDE.md §1.
  for (const k of KEYS) {
    const v = body[k];
    if (v == null) continue;
    await prisma.setting.upsert({
      where: { key: k },
      create: { key: k, value: v as object },
      update: { value: v as object },
    });
  }

  // watchlist → синхронизируем строки Collection (как seed), иначе листингам не к чему привязаться.
  const watchlist = body.watchlist;
  if (Array.isArray(watchlist)) {
    for (const c of watchlist as WatchItem[]) {
      if (!c?.address || !c?.name) continue;
      await prisma.collection.upsert({
        where: { address: c.address },
        create: { address: c.address, name: c.name, slug: c.slug || null },
        update: { name: c.name, slug: c.slug || null },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
