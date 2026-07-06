-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('running', 'success', 'failed', 'partial');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('active', 'sold', 'delisted', 'insufficient_data');

-- CreateEnum
CREATE TYPE "BasePriceSource" AS ENUM ('sales_7d', 'sales_30d', 'listings_p25', 'insufficient_data');

-- CreateEnum
CREATE TYPE "ListingEventType" AS ENUM ('new', 'price_up', 'price_down', 'delisted', 'sold', 'reappeared');

-- CreateEnum
CREATE TYPE "SaleConfidence" AS ENUM ('inferred', 'confirmed');

-- CreateEnum
CREATE TYPE "PriceKind" AS ENUM ('ask_eq_fill', 'ask_upper_bound', 'exact');

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" SERIAL NOT NULL,
    "address" TEXT NOT NULL,
    "slug" TEXT,
    "name" TEXT NOT NULL,
    "modelName" TEXT,
    "totalSupply" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NftItem" (
    "id" SERIAL NOT NULL,
    "collectionId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "name" TEXT,
    "index" TEXT,
    "attributes" JSONB,
    "imageUrl" TEXT,
    "ownerAddress" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NftItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeRarity" (
    "id" SERIAL NOT NULL,
    "collectionId" INTEGER NOT NULL,
    "traitType" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "rarityPct" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttributeRarity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scan" (
    "id" SERIAL NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "ScanStatus" NOT NULL DEFAULT 'running',
    "trigger" TEXT,
    "scannedCollectionIds" INTEGER[],
    "numListingsSeen" INTEGER,
    "numNew" INTEGER,
    "numChanged" INTEGER,
    "numGone" INTEGER,
    "error" TEXT,
    "durationMs" INTEGER,

    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" SERIAL NOT NULL,
    "nftItemId" INTEGER NOT NULL,
    "collectionId" INTEGER NOT NULL,
    "marketplace" TEXT,
    "marketplaceUrl" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'TON',
    "priceAmount" DECIMAL(38,9),
    "priceUsdNet" DECIMAL(20,2),
    "expectedPriceAmount" DECIMAL(38,9),
    "expectedPriceUsdNet" DECIMAL(20,2),
    "undervaluationPct" DOUBLE PRECISION,
    "liquidityFactor" DOUBLE PRECISION,
    "freshnessFactor" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "basePriceSource" "BasePriceSource",
    "dealScore" DOUBLE PRECISION,
    "status" "ListingStatus" NOT NULL DEFAULT 'active',
    "sellerAddress" TEXT,
    "listedAt" TIMESTAMP(3),
    "priceUpdatedAt" TIMESTAMP(3),
    "firstSeenScanId" INTEGER,
    "lastSeenScanId" INTEGER,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingEvent" (
    "id" SERIAL NOT NULL,
    "scanId" INTEGER NOT NULL,
    "listingId" INTEGER,
    "nftItemId" INTEGER NOT NULL,
    "collectionId" INTEGER NOT NULL,
    "eventType" "ListingEventType" NOT NULL,
    "oldPriceAmount" DECIMAL(38,9),
    "newPriceAmount" DECIMAL(38,9),
    "oldPriceUsdNet" DECIMAL(20,2),
    "newPriceUsdNet" DECIMAL(20,2),
    "priceDeltaPct" DOUBLE PRECISION,
    "dealScoreAtEvent" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" SERIAL NOT NULL,
    "collectionId" INTEGER NOT NULL,
    "nftItemId" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TON',
    "priceAmount" DECIMAL(38,9),
    "priceUsdNet" DECIMAL(20,2),
    "seller" TEXT,
    "buyer" TEXT,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "confidence" "SaleConfidence" NOT NULL DEFAULT 'inferred',
    "priceKind" "PriceKind",
    "detectedScanId" INTEGER,
    "prevScanId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCollectionAggregate" (
    "id" SERIAL NOT NULL,
    "collectionId" INTEGER NOT NULL,
    "day" DATE NOT NULL,
    "floorAmount" DECIMAL(38,9),
    "floorUsdNet" DECIMAL(20,2),
    "listingsCount" INTEGER,
    "salesCount24h" INTEGER,
    "volume24hUsdNet" DECIMAL(20,2),
    "medianPrice" DECIMAL(38,9),

    CONSTRAINT "DailyCollectionAggregate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Collection_address_key" ON "Collection"("address");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_slug_key" ON "Collection"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "NftItem_address_key" ON "NftItem"("address");

-- CreateIndex
CREATE INDEX "NftItem_collectionId_idx" ON "NftItem"("collectionId");

-- CreateIndex
CREATE INDEX "AttributeRarity_collectionId_idx" ON "AttributeRarity"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeRarity_collectionId_traitType_value_key" ON "AttributeRarity"("collectionId", "traitType", "value");

-- CreateIndex
CREATE INDEX "Scan_startedAt_idx" ON "Scan"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_nftItemId_key" ON "Listing"("nftItemId");

-- CreateIndex
CREATE INDEX "Listing_collectionId_idx" ON "Listing"("collectionId");

-- CreateIndex
CREATE INDEX "Listing_dealScore_idx" ON "Listing"("dealScore");

-- CreateIndex
CREATE INDEX "Listing_status_idx" ON "Listing"("status");

-- CreateIndex
CREATE INDEX "Listing_priceUsdNet_idx" ON "Listing"("priceUsdNet");

-- CreateIndex
CREATE INDEX "ListingEvent_scanId_idx" ON "ListingEvent"("scanId");

-- CreateIndex
CREATE INDEX "ListingEvent_scanId_eventType_idx" ON "ListingEvent"("scanId", "eventType");

-- CreateIndex
CREATE INDEX "ListingEvent_nftItemId_createdAt_idx" ON "ListingEvent"("nftItemId", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_collectionId_soldAt_idx" ON "Sale"("collectionId", "soldAt");

-- CreateIndex
CREATE INDEX "Sale_nftItemId_soldAt_idx" ON "Sale"("nftItemId", "soldAt");

-- CreateIndex
CREATE INDEX "Sale_confidence_idx" ON "Sale"("confidence");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_nftItemId_detectedScanId_key" ON "Sale"("nftItemId", "detectedScanId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCollectionAggregate_collectionId_day_key" ON "DailyCollectionAggregate"("collectionId", "day");

-- AddForeignKey
ALTER TABLE "NftItem" ADD CONSTRAINT "NftItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeRarity" ADD CONSTRAINT "AttributeRarity_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_nftItemId_fkey" FOREIGN KEY ("nftItemId") REFERENCES "NftItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingEvent" ADD CONSTRAINT "ListingEvent_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingEvent" ADD CONSTRAINT "ListingEvent_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingEvent" ADD CONSTRAINT "ListingEvent_nftItemId_fkey" FOREIGN KEY ("nftItemId") REFERENCES "NftItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingEvent" ADD CONSTRAINT "ListingEvent_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_nftItemId_fkey" FOREIGN KEY ("nftItemId") REFERENCES "NftItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCollectionAggregate" ADD CONSTRAINT "DailyCollectionAggregate_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

