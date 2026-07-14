// One-off миграция: создаёт таблицы вкладки «Объёмы» (VolumeRun, CollectionVolume) + индексы + FK.
// Применяется через Neon HTTP-драйвер (prisma.$executeRawUnsafe → адаптер по 443, инвариант 1), по одному
// DDL. Идемпотентна (IF NOT EXISTS / проверка существования FK). Запуск: npx tsx scripts/migrate-volumes.ts
import "dotenv/config";
import { prisma } from "../src/lib/db";

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = $1`,
    table
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function constraintExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM information_schema.table_constraints WHERE constraint_name = $1`,
    name
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function main() {
  // 1) VolumeRun
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "VolumeRun" (
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
    )`);
  console.log("[1] CREATE TABLE VolumeRun — ok");

  // 2) CollectionVolume
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CollectionVolume" (
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
    )`);
  console.log("[2] CREATE TABLE CollectionVolume — ok");

  // 3) индексы
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "VolumeRun_period_startedAt_idx" ON "VolumeRun"("period","startedAt")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "CollectionVolume_runId_idx" ON "CollectionVolume"("runId")`
  );
  console.log("[3] CREATE INDEX (VolumeRun, CollectionVolume) — ok");

  // 4) FK (нет IF NOT EXISTS у ADD CONSTRAINT — проверяем вручную)
  if (!(await constraintExists("CollectionVolume_runId_fkey"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "CollectionVolume" ADD CONSTRAINT "CollectionVolume_runId_fkey" ` +
        `FOREIGN KEY ("runId") REFERENCES "VolumeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE`
    );
    console.log("[4] ADD FK CollectionVolume_runId_fkey — ok");
  } else {
    console.log("[4] FK CollectionVolume_runId_fkey уже есть — пропуск");
  }

  console.log(
    `\n── AFTER ── VolumeRun: ${await tableExists("VolumeRun")}  CollectionVolume: ${await tableExists(
      "CollectionVolume"
    )}`
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
