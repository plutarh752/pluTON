// Giftstat (api.giftstat.app) — keyless-агрегатор каталога подарков. Объёма/продаж он НЕ отдаёт (probe:
// /volume, /sales, /activity → 404; см. CLAUDE.md), поэтому объём берём из Portals. Здесь Giftstat нужен
// только как источник (a) `blockchain_address` коллекции → ссылка на Getgems и (b) telegramId как фолбэк
// к gift-satellite-каталогу. Его `id`/`str_id` = ТОТ ЖЕ telegramId, что у gift-satellite и changes.tg.
const BASE = (process.env.GIFTSTAT_BASE_URL ?? "https://api.giftstat.app").replace(/\/$/, "");

interface GiftstatCollection {
  id?: number;
  str_id?: string;
  collection?: string;
  blockchain_address?: string;
}

export interface CollectionMeta {
  telegramId?: string;
  blockchainAddress?: string;
}

/** name → { telegramId, blockchainAddress } из keyless Giftstat. best-effort (при падении — пустая карта). */
export async function giftstatMetaMap(): Promise<Record<string, CollectionMeta>> {
  const res = await fetch(`${BASE}/current/collections?limit=500`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`giftstat ${res.status}`);
  const d = (await res.json()) as { data?: GiftstatCollection[] };
  const rows = Array.isArray(d?.data) ? d.data : [];
  const map: Record<string, CollectionMeta> = {};
  for (const c of rows) {
    if (!c.collection) continue;
    map[c.collection] = {
      telegramId: c.str_id ?? (c.id != null ? String(c.id) : undefined),
      blockchainAddress: c.blockchain_address,
    };
  }
  return map;
}
