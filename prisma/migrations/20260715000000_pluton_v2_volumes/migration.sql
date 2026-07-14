-- CreateTable
CREATE TABLE "VolumeRun" (
    "id" SERIAL NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "ScanStatus" NOT NULL DEFAULT 'running',
    "trigger" TEXT,
    "period" TEXT NOT NULL,
    "collectionsCount" INTEGER,
    "authOk" BOOLEAN,
    "error" TEXT,
    "durationMs" INTEGER,

    CONSTRAINT "VolumeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionVolume" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "telegramId" TEXT,
    "collectionName" TEXT NOT NULL,
    "floorTon" DECIMAL(38,9),
    "volumeTon" DECIMAL(38,9) NOT NULL,
    "volumeUsd" DECIMAL(20,2),
    "salesCount" INTEGER,
    "lastSaleAt" TIMESTAMP(3),
    "topModels" JSONB,
    "isPartial" BOOLEAN NOT NULL DEFAULT false,
    "blockchainAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionVolume_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VolumeRun_period_startedAt_idx" ON "VolumeRun"("period", "startedAt");

-- CreateIndex
CREATE INDEX "CollectionVolume_runId_idx" ON "CollectionVolume"("runId");

-- AddForeignKey
ALTER TABLE "CollectionVolume" ADD CONSTRAINT "CollectionVolume_runId_fkey" FOREIGN KEY ("runId") REFERENCES "VolumeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
