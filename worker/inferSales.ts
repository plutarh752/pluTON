// inferSales — вменённые продажи из кросс-скан дельт (план §3.1). Чистая функция, без БД.
//
// Правило: пока лот на продаже, NFT в эскроу, а продавец = sale.owner (сохраняем в seller).
// На следующем скане, если лот больше не в sale:
//   owner == seller  → delisted (продажи нет)
//   owner != seller  → inferred sale покупателю owner по последней известной цене.
// Слепая зона: лот, выставленный и проданный МЕЖДУ сканами, не наблюдался как active → не засчитается
// (liquidity_factor — нижняя оценка; сильнее занижен у самых горячих лотов).

export interface PrevActiveListing {
  nftItemId: number;
  priceTon: number | null; // последняя известная цена (ask); для fixed-price == fill
  sellerAddress: string | null;
  isAuction?: boolean;
}

export interface CurrentItemState {
  nftItemId: number;
  onSale: boolean;
  ownerAddress: string | null;
}

export interface InferredSale {
  nftItemId: number;
  priceTon: number | null;
  seller: string | null;
  buyer: string | null;
  priceKind: "ask_eq_fill" | "ask_upper_bound";
}

export interface InferSalesResult {
  sales: InferredSale[];
  delistedItemIds: number[];
}

/**
 * @param prevActive лоты, бывшие active на прошлом скане (по этой коллекции)
 * @param current    текущее состояние тех же items (onSale + owner) из свежего скана
 */
export function inferSales(prevActive: PrevActiveListing[], current: Map<number, CurrentItemState>): InferSalesResult {
  const sales: InferredSale[] = [];
  const delistedItemIds: number[] = [];

  for (const prev of prevActive) {
    const now = current.get(prev.nftItemId);
    // Нет в текущем скане (не отсканирован) — не трогаем, чтобы не делистить ложно.
    if (!now) continue;
    // Всё ещё на продаже — не событие для inferSales.
    if (now.onSale) continue;

    const soldOut = prev.sellerAddress != null && now.ownerAddress != null && now.ownerAddress !== prev.sellerAddress;

    if (soldOut) {
      sales.push({
        nftItemId: prev.nftItemId,
        priceTon: prev.priceTon,
        seller: prev.sellerAddress,
        buyer: now.ownerAddress,
        priceKind: prev.isAuction ? "ask_upper_bound" : "ask_eq_fill",
      });
    } else {
      delistedItemIds.push(prev.nftItemId);
    }
  }

  return { sales, delistedItemIds };
}
