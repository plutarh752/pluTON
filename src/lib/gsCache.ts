import { prisma } from "./db";

// Кэш каталожных ответов gift-satellite в Setting-строке (ключи `gs_cache:*`), чтобы не биться в
// rate limits на каждый рендер dropdown'ов. При ошибке источника отдаём УСТАРЕВШИЙ кэш (graceful).
export async function cachedGs<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<{ data: T; stale: boolean }> {
  const row = await prisma.setting.findUnique({ where: { key } });
  const cache = row?.value as { at?: string; data?: T } | null | undefined;
  const fresh = cache?.at != null && Date.now() - new Date(cache.at).getTime() < ttlMs;
  if (fresh && cache?.data !== undefined) return { data: cache.data as T, stale: false };

  try {
    const data = await fetcher();
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: { at: new Date().toISOString(), data } as object },
      update: { value: { at: new Date().toISOString(), data } as object },
    });
    return { data, stale: false };
  } catch (e) {
    if (cache?.data !== undefined) return { data: cache.data as T, stale: true }; // stale-on-error
    throw e;
  }
}
