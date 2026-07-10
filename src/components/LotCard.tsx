import { GiftImage } from "./GiftImage";
import { LotPrice } from "./LotPrice";
import { FloorChip } from "./FloorChip";
import { marketLabel } from "@/lib/giftSatellite";

export interface LotView {
  id: number;
  slug: string;
  number: number | null;
  market: string;
  imageUrl: string | null;
  link: string | null;
  priceTon: number;
  priceStars: number | null;
  priceUsd: number | null;
  floorDeviationPct: number | null;
}

// Карточка лота (Stitch-экран 2): картинка + бейдж #номер, площадка, цена TON/⭐/$ и чип % от floor.
export function LotCard({ lot }: { lot: LotView }) {
  const card = (
    <div className="border border-outline-variant bg-surface transition-colors hover:border-outline">
      <div className="relative aspect-square w-full overflow-hidden bg-surface-container-high">
        <GiftImage src={lot.imageUrl} alt={lot.slug} />
        {lot.number != null && (
          <div className="absolute left-2 top-2 border border-outline-variant bg-black/80 px-2 py-1 font-mono text-[10px] text-white">
            #{lot.number}
          </div>
        )}
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between">
          <span className="text-label-md uppercase tracking-widest text-on-surface-variant">Platform</span>
          <span className="font-mono text-body-md text-primary">{marketLabel(lot.market)}</span>
        </div>
        <div className="flex items-end justify-between gap-2">
          <FloorChip pct={lot.floorDeviationPct} />
          <LotPrice ton={lot.priceTon} stars={lot.priceStars} usd={lot.priceUsd} />
        </div>
      </div>
    </div>
  );

  return lot.link ? (
    <a href={lot.link} target="_blank" rel="noreferrer" className="block">
      {card}
    </a>
  ) : (
    card
  );
}
