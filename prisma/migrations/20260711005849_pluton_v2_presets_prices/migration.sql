-- CreateTable
CREATE TABLE "Preset" (
    "id" SERIAL NOT NULL,
    "userId" TEXT,
    "collectionName" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "backdropName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "previewImageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Preset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceRun" (
    "id" SERIAL NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "ScanStatus" NOT NULL DEFAULT 'running',
    "trigger" TEXT,
    "marketStatus" JSONB,
    "presetsCount" INTEGER,
    "lotsCount" INTEGER,
    "error" TEXT,
    "durationMs" INTEGER,

    CONSTRAINT "PriceRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketListing" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "presetId" INTEGER NOT NULL,
    "collectionName" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "giftId" TEXT,
    "number" INTEGER,
    "modelName" TEXT,
    "backdropName" TEXT,
    "symbolName" TEXT,
    "priceTon" DECIMAL(38,9) NOT NULL,
    "priceStars" DECIMAL(20,2),
    "priceUsd" DECIMAL(20,2),
    "floorTon" DECIMAL(38,9),
    "floorDeviationPct" DOUBLE PRECISION,
    "imageUrl" TEXT,
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Preset_collectionName_modelName_backdropName_key" ON "Preset"("collectionName", "modelName", "backdropName");

-- CreateIndex
CREATE INDEX "PriceRun_startedAt_idx" ON "PriceRun"("startedAt");

-- CreateIndex
CREATE INDEX "MarketListing_runId_idx" ON "MarketListing"("runId");

-- CreateIndex
CREATE INDEX "MarketListing_presetId_idx" ON "MarketListing"("presetId");

-- AddForeignKey
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PriceRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "Preset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

