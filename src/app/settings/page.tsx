import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/db";
import { SettingsForm, type SettingsShape, type RescoreState } from "@/components/SettingsForm";

// Экран 5: Settings — курсы, комиссии, cooldown, веса осей, пороги, ключ tonapi, watchlist + пересчёт.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  noStore();

  const [rows, axes, rescoreRow] = await Promise.all([
    prisma.setting.findMany(),
    prisma.attributeRarity.findMany({ distinct: ["traitType"], select: { traitType: true } }),
    prisma.setting.findUnique({ where: { key: "rescore_state" } }),
  ]);

  const settings: Record<string, unknown> = {};
  for (const r of rows) settings[r.key] = r.value;
  const dbAxes = axes.map((a) => a.traitType).sort();

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-semibold">Настройки</h1>
      <p className="max-w-3xl text-sm text-neutral-500">
        Меняешь курсы/комиссии/веса/пороги → «Сохранить и пересчитать»: пересчёт (worker:rescore) заново
        считает expected / undervaluation / liquidity / confidence / Deal Score по данным из БД, без обращения
        к tonapi. Новые данные подтягивает только «Скан».
      </p>
      <SettingsForm
        initial={settings as unknown as SettingsShape}
        dbAxes={dbAxes}
        rescore={(rescoreRow?.value as RescoreState) ?? null}
      />
    </section>
  );
}
