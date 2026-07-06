// Клиент tonapi.io. Единственный источник данных MVP (см. план §0).
// Free tier = 1 RPS → встроенный лимитер; пагинация коллекции limit=1000 (спайк: ~3 запроса на коллекцию).

const BASE = process.env.TONAPI_BASE_URL ?? "https://tonapi.io/v2";
const KEY = process.env.TONAPI_KEY ?? "";
const MIN_INTERVAL_MS = 1100; // 1 RPS с запасом
const PAGE = 1000;

export interface TonApiPrice {
  value: string; // в минимальных единицах (nanoton)
  token_name?: string; // "Gram" == TON
  decimals?: number; // 9
  currency_type?: string;
}

export interface TonApiSale {
  address: string;
  market?: { address: string; name?: string };
  owner?: { address: string; name?: string }; // реальный продавец (эскроу)
  price?: TonApiPrice;
}

export interface TonApiNftItem {
  address: string;
  index?: number | string;
  owner?: { address: string; name?: string };
  metadata?: { name?: string; image?: string; attributes?: { trait_type: string; value: string }[] };
  sale?: TonApiSale | null;
}

export interface TonApiCollection {
  address: string;
  next_item_index?: number;
  metadata?: { name?: string; image?: string; description?: string };
}

export class TonApi {
  private last = 0;

  private async throttle() {
    const wait = this.last + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.last = Date.now();
  }

  private async get<T>(path: string): Promise<T> {
    await this.throttle();
    const headers: Record<string, string> = { Accept: "application/json" };
    if (KEY) headers.Authorization = `Bearer ${KEY}`;
    const res = await fetch(`${BASE}${path}`, { headers });
    if (!res.ok) throw new Error(`tonapi ${res.status} on ${path}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  }

  getCollection(address: string): Promise<TonApiCollection> {
    return this.get<TonApiCollection>(`/nfts/collections/${address}`);
  }

  /** Все items коллекции (пагинация limit=1000). Каждый item несёт attributes (редкость) и sale (листинг).
   *  Дедуп по address: offset-пагинация tonapi на больших коллекциях (десятки тысяч) может отдавать один
   *  и тот же item на разных страницах — иначе ловим дубли (и краш unique) вниз по стеку. */
  async getCollectionItems(address: string): Promise<TonApiNftItem[]> {
    const byAddress = new Map<string, TonApiNftItem>();
    for (let offset = 0; ; offset += PAGE) {
      const d = await this.get<{ nft_items: TonApiNftItem[] }>(
        `/nfts/collections/${address}/items?limit=${PAGE}&offset=${offset}`
      );
      const batch = d.nft_items ?? [];
      for (const it of batch) byAddress.set(it.address, it);
      if (batch.length < PAGE) break;
    }
    return [...byAddress.values()];
  }

  /** Курс TON→USD (обновляем settings.rates.ton_usd на каждом скане). */
  async getTonUsd(): Promise<number> {
    const d = await this.get<{ rates: { TON: { prices: { USD: number } } } }>(`/rates?tokens=ton&currencies=usd`);
    return d.rates.TON.prices.USD;
  }
}

/** Цена листинга в TON из объекта sale. null, если 0/неизвестна (аукцион/недекодируемо, ~7% — пропускаем). */
export function saleToPriceTon(sale: TonApiSale | null | undefined): number | null {
  if (!sale?.price) return null;
  const dec = sale.price.decimals ?? 9;
  const v = Number(sale.price.value ?? "0");
  if (!v || Number.isNaN(v)) return null;
  return v / 10 ** dec;
}
