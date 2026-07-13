import { prisma } from "./db";

// Единая логика «живого» прогона цен — используется И роутом (/api/prices), И витриной (page.tsx),
// чтобы осиротевший PriceRun{running} (воркер завис/упал, не закрыв строку) НЕ блокировал кнопку навсегда.
// Раньше page.tsx читал сырой status="running" без учёта возраста → залипшая строка держала кнопку
// вечно, хотя /api/prices уже считал её мёртвой. Теперь порог один на оба места.

// Строку running старше этого возраста считаем «мёртвой». Реальный прогон занимает ~25с.
export const STALE_RUNNING_MS = 10 * 60_000;

/** Свежий прогон в статусе running (не залипший). null → залипших нет, можно запускать новый. */
export async function freshRunningRun() {
  const running = await prisma.priceRun.findFirst({
    where: { status: "running" },
    orderBy: { startedAt: "desc" },
  });
  if (!running) return null;
  if (Date.now() - running.startedAt.getTime() > STALE_RUNNING_MS) return null;
  return running;
}
