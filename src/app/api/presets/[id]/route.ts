import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Удаление пресета по id.
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const presetId = Number(id);
  if (!Number.isInteger(presetId)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  try {
    await prisma.preset.delete({ where: { id: presetId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as { code?: string }).code === "P2025") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }
}
