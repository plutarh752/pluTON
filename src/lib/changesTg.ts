// Арт подарков из api.changes.tg — ЧИСТЫЙ арт модели (без фона) и ДЕФОЛТНЫЙ вид подарка до апгрейда.
// gift-satellite отдаёт только листинги конкретных экземпляров (slug+backdrop) — чистого арта у него НЕТ
// (подтверждено probe'ом). changes.tg — бесплатный keyless источник официального арта Telegram-подарков.
//
// URL детерминированы и неизменны → строим без сетевых запросов, кэш байтов держит CDN/браузер.
// `<gift>` в обоих эндпоинтах принимает Telegram gift id → джойним по `telegramId` (его отдаёт
// gift-satellite per-collection), НЕ по имени: id резолвит коллекции, которые не совпадают по имени
// (Castle → 400 по имени, 200 по id; Durov's Cap — кудрявый апостроф). Имена МОДЕЛЕЙ у обоих источников
// из официальных атрибутов Telegram и совпадают точно, поэтому модель джойним по имени.
//
// АТРИБУЦИЯ (требование changes.tg): в UI обязателен видимый кредит @GiftChanges — см. Footer.tsx.
const BASE = (process.env.CHANGES_TG_BASE_URL ?? "https://api.changes.tg").replace(/\/$/, "");

// Доступные размеры на стороне API: 64 | 128 | 256 | 512 | 1024 (сервер ресайзит png).
export type ChangesTgSize = 64 | 128 | 256 | 512 | 1024;

/** Чистый арт модели без фона. `gift` = telegramId коллекции, `model` = имя модели (как в gift-satellite). */
export function changesModelImageUrl(
  gift: string | null | undefined,
  model: string | null | undefined,
  size: ChangesTgSize = 256
): string | null {
  if (!gift || !model) return null;
  return `${BASE}/model/${encodeURIComponent(gift)}/${encodeURIComponent(model)}.png?size=${size}`;
}

/** Дефолтный вид подарка ДО апгрейда. `gift` = telegramId коллекции (принимает и имя, но id надёжнее). */
export function changesOriginalImageUrl(
  gift: string | null | undefined,
  size: ChangesTgSize = 256
): string | null {
  if (!gift) return null;
  return `${BASE}/original/${encodeURIComponent(gift)}.png?size=${size}`;
}
