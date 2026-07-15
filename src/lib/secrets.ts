import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { prisma } from "./db";

// Хранилище пользовательских API-секретов (GIFT_SATELLITE_KEY/TONAPI_KEY/TELEGRAM_*) — переезд из .env,
// чтобы шаринг папки с кодом не утаскивал реальные ключи. Одна строка Setting{key:"secrets"}, каждое
// поле — свой AES-256-GCM конверт (свой IV), можно менять/чистить поле не трогая остальные.

const SETTINGS_KEY = "secrets";

export type Field = "giftSatelliteKey" | "tonapiKey" | "telegramApiId" | "telegramApiHash" | "telegramSession";
const FIELDS: Field[] = ["giftSatelliteKey", "tonapiKey", "telegramApiId", "telegramApiHash", "telegramSession"];

interface EncryptedValue {
  iv: string; // hex
  tag: string; // hex
  ct: string; // hex
}
type StoredSecrets = Partial<Record<Field, EncryptedValue>>;

function loadKey(): Buffer {
  const hex = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY не задан — сгенерируй: openssl rand -hex 32 (см. .env.example). " +
        "Этим ключом шифруются GIFT_SATELLITE_KEY/TONAPI_KEY/TELEGRAM_* в БД."
    );
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error(`SETTINGS_ENCRYPTION_KEY должен быть 32-байтным hex (64 символа), получено ${key.length} байт`);
  }
  return key;
}

// Eager — тот же fail-fast стиль, что createPrisma() в db.ts для DATABASE_URL: без ключа приложение
// всё равно нерабочее (нечем расшифровать секреты), лучше упасть сразу и понятно, чем на первом запросе.
const KEY = loadKey();

function encrypt(plaintext: string): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex"), ct: ct.toString("hex") };
}

function decrypt(value: EncryptedValue): string {
  const decipher = createDecipheriv("aes-256-gcm", KEY, Buffer.from(value.iv, "hex"));
  decipher.setAuthTag(Buffer.from(value.tag, "hex"));
  const pt = Buffer.concat([decipher.update(Buffer.from(value.ct, "hex")), decipher.final()]);
  return pt.toString("utf8");
}

// In-memory TTL-кэш поверх ещё-зашифрованной строки — прогон воркера дёргает getGiftSatelliteKey() на
// каждый HTTP-вызов gift-satellite (их сотни за прогон); без кэша это сотни лишних round-trip'ов в Neon.
// 60с достаточно, чтобы схлопнуть весь прогон в ~1 чтение, и достаточно коротко, чтобы только что
// сохранённый в /settings ключ подхватился без рестарта процесса. Не путать с 6ч TTL gsCache.ts — та
// кэширует дорогой сторонний каталог, а не собственные данные приложения.
const CACHE_TTL_MS = 60_000;
let cache: { at: number; row: StoredSecrets } | null = null;

async function loadRow(): Promise<StoredSecrets> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.row;
  const setting = await prisma.setting.findUnique({ where: { key: SETTINGS_KEY } });
  const row = (setting?.value as StoredSecrets | null) ?? {};
  cache = { at: Date.now(), row };
  return row;
}

async function getField(field: Field): Promise<string | null> {
  const row = await loadRow();
  const enc = row[field];
  if (!enc) return null;
  try {
    return decrypt(enc);
  } catch {
    return null; // повреждённое/несовместимое значение — считаем незаданным, не роняем вызывающий код
  }
}

export async function getGiftSatelliteKey(): Promise<string | null> {
  return getField("giftSatelliteKey");
}

export async function getTonapiKey(): Promise<string | null> {
  return getField("tonapiKey");
}

export async function getTelegramCreds(): Promise<{
  apiId: string | null;
  apiHash: string | null;
  session: string | null;
}> {
  const [apiId, apiHash, session] = await Promise.all([
    getField("telegramApiId"),
    getField("telegramApiHash"),
    getField("telegramSession"),
  ]);
  return { apiId, apiHash, session };
}

export async function isGiftSatelliteConfigured(): Promise<boolean> {
  return !!(await getGiftSatelliteKey());
}

export async function isTelegramConfigured(): Promise<boolean> {
  const creds = await getTelegramCreds();
  return !!(creds.apiId && creds.apiHash && creds.session);
}

/** Статус по каждому полю (задано/нет) — для GET /api/settings. Плейнтекст секретов клиенту не уходит. */
export async function getSecretsStatus(): Promise<Record<Field, boolean>> {
  const row = await loadRow();
  const status = {} as Record<Field, boolean>;
  for (const f of FIELDS) status[f] = !!row[f];
  return status;
}

/** `null` в значении поля — явная очистка; отсутствие ключа в partial — поле не трогаем. */
export async function setSecrets(partial: Partial<Record<Field, string | null>>): Promise<void> {
  const current = await loadRow();
  const next: StoredSecrets = { ...current };
  for (const [field, value] of Object.entries(partial) as [Field, string | null][]) {
    if (value == null) delete next[field];
    else next[field] = encrypt(value);
  }
  await prisma.setting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: next as object },
    update: { value: next as object },
  });
  cache = null; // сразу инвалидируем — следующий читатель (в т.ч. этот же процесс) видит новое значение
}
