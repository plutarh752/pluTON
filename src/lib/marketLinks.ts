// Ссылки на маркеты по коллекции для вкладки «Объёмы». Client-safe (без process.env/сети).
// Надёжный per-collection deep-link есть только у Getgems (по on-chain адресу коллекции). У Portals/
// Fragment детерминированного per-collection URL из открытых данных нет → даём вход в маркет (best-effort,
// как оговорено в плане: ненадёжные per-collection ссылки не выдумываем).

export interface MarketLink {
  label: string;
  url: string;
}

export function collectionMarketLinks(opts: {
  collectionName: string;
  blockchainAddress?: string | null;
}): MarketLink[] {
  const links: MarketLink[] = [];
  if (opts.blockchainAddress) {
    links.push({ label: "Getgems", url: `https://getgems.io/collection/${opts.blockchainAddress}` });
  }
  links.push({ label: "Portals", url: "https://t.me/portals" });
  links.push({ label: "Fragment", url: "https://fragment.com/gifts" });
  return links;
}
