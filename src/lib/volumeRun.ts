import { prisma } from "./db";

// «Живой» прогон «Получить объём» — как freshRunningRun для цен: осиротевший VolumeRun{running}
// (сайдкар/воркер упал, не закрыв строку) НЕ должен блокировать кнопку навсегда. Прогон объёма тяжелее
// ценового (per-collection пагинация Portals под бюджетом ~9 мин) → порог «мёртвой» строки выше.
export const STALE_VOLUME_RUNNING_MS = 20 * 60_000;

/** Свежий прогон объёма в статусе running (не залипший). null → можно запускать новый. */
export async function freshVolumeRun() {
  const running = await prisma.volumeRun.findFirst({
    where: { status: "running" },
    orderBy: { startedAt: "desc" },
  });
  if (!running) return null;
  if (Date.now() - running.startedAt.getTime() > STALE_VOLUME_RUNNING_MS) return null;
  return running;
}
