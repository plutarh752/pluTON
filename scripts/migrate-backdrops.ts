// One-off миграция Preset.backdropName (String) → backdropNames (String[]), unique (collection,model).
// Применяется через Neon HTTP-драйвер (prisma.$executeRawUnsafe → адаптер по 443, инвариант 1),
// по одному DDL. Данные сохраняются: старый фон оборачивается в массив, дубли (collection,model)
// мержатся перед новым unique. Идемпотентна. Запуск: npx tsx scripts/migrate-backdrops.ts
import "dotenv/config";
import { prisma } from "../src/lib/db";

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    table,
    column
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

function arrayLiteral(names: string[]): string {
  return `ARRAY[${names.map((n) => `'${n.replace(/'/g, "''")}'`).join(",")}]::text[]`;
}

async function main() {
  const hasOld = await columnExists("Preset", "backdropName");
  console.log(`backdropName column present: ${hasOld}`);

  // BEFORE
  if (hasOld) {
    const before = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, "collectionName", "modelName", "backdropName" FROM "Preset" ORDER BY id`
    );
    console.log("\n── BEFORE (id, collection, model, backdropName) ──");
    for (const r of before) console.log(`  #${r.id}  ${r.collectionName} / ${r.modelName} / ${r.backdropName}`);

    // 1) add new column (nullable text[], как у Prisma diff)
    await prisma.$executeRawUnsafe(`ALTER TABLE "Preset" ADD COLUMN IF NOT EXISTS "backdropNames" TEXT[]`);
    console.log("\n[1] ADD COLUMN backdropNames TEXT[] — ok");

    // 2) backfill: старый фон → одноэлементный массив
    await prisma.$executeRawUnsafe(
      `UPDATE "Preset" SET "backdropNames" = ARRAY["backdropName"] WHERE "backdropName" IS NOT NULL`
    );
    console.log("[2] backfill backdropNames = ARRAY[backdropName] — ok");

    // 3) merge дублей по (collection, model) перед новым unique
    const groups = new Map<string, { keep: number; names: Set<string>; drop: number[] }>();
    for (const r of before) {
      const key = `${r.collectionName}${r.modelName}`;
      const g = groups.get(key);
      if (g) {
        g.names.add(r.backdropName);
        g.drop.push(r.id);
      } else {
        groups.set(key, { keep: r.id, names: new Set([r.backdropName]), drop: [] });
      }
    }
    let merged = 0;
    for (const g of groups.values()) {
      if (g.drop.length === 0) continue;
      await prisma.$executeRawUnsafe(
        `UPDATE "Preset" SET "backdropNames" = ${arrayLiteral([...g.names])} WHERE id = ${g.keep}`
      );
      await prisma.$executeRawUnsafe(`DELETE FROM "Preset" WHERE id IN (${g.drop.join(",")})`);
      merged += g.drop.length;
    }
    console.log(`[3] merge дублей (collection,model): удалено строк ${merged}`);

    // 4) drop старый unique index
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "Preset_collectionName_modelName_backdropName_key"`);
    console.log("[4] DROP INDEX старый unique — ok");

    // 5) drop старую колонку
    await prisma.$executeRawUnsafe(`ALTER TABLE "Preset" DROP COLUMN IF EXISTS "backdropName"`);
    console.log("[5] DROP COLUMN backdropName — ok");
  } else {
    // уже мигрировано — на всякий случай гарантируем колонку/индекс
    await prisma.$executeRawUnsafe(`ALTER TABLE "Preset" ADD COLUMN IF NOT EXISTS "backdropNames" TEXT[]`);
    console.log("backdropName нет — считаем уже мигрированным, гарантируем backdropNames.");
  }

  // 6) new unique (collection, model)
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "Preset_collectionName_modelName_key" ON "Preset"("collectionName","modelName")`
  );
  console.log("[6] CREATE UNIQUE INDEX (collectionName, modelName) — ok");

  // AFTER
  const after = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, "collectionName", "modelName", "backdropNames" FROM "Preset" ORDER BY id`
  );
  console.log("\n── AFTER (id, collection, model, backdropNames) ──");
  for (const r of after) console.log(`  #${r.id}  ${r.collectionName} / ${r.modelName} / [${r.backdropNames}]`);

  const idx = await prisma.$queryRawUnsafe<any[]>(
    `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'Preset' ORDER BY indexname`
  );
  console.log("\n── INDEXES on Preset ──");
  for (const i of idx) console.log(`  ${i.indexname}: ${i.indexdef}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
