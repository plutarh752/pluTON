// Батч-персист для скана: чанкованные bulk-upsert'ы (каждый запрос = round-trip к Neon по HTTP).
import type { PrismaClient } from "@prisma/client";
import type { RarityMap, Attribute } from "../src/lib/scoring";
import type { TonApiNftItem } from "../src/lib/tonapi";

const CHUNK = 1000;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Bulk-upsert NftItem по address (несколько чанков вместо тысяч отдельных запросов). */
export async function upsertItems(prisma: PrismaClient, collectionId: number, items: TonApiNftItem[]) {
  for (const part of chunk(items, CHUNK)) {
    const values: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    for (const it of part) {
      values.push(`($${p++},$${p++},$${p++},$${p++},$${p++}::jsonb,$${p++},$${p++})`);
      params.push(
        collectionId,
        it.address,
        it.metadata?.name ?? null,
        it.index != null ? String(it.index) : null,
        JSON.stringify(it.metadata?.attributes ?? []),
        it.metadata?.image ?? null,
        it.owner?.address ?? null
      );
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "NftItem" ("collectionId","address","name","index","attributes","imageUrl","ownerAddress")
       VALUES ${values.join(",")}
       ON CONFLICT ("address") DO UPDATE SET
         "name"=EXCLUDED."name","index"=EXCLUDED."index","attributes"=EXCLUDED."attributes",
         "imageUrl"=EXCLUDED."imageUrl","ownerAddress"=EXCLUDED."ownerAddress","lastSeenAt"=now()`,
      ...params
    );
  }
}

/** Bulk-upsert AttributeRarity по (collectionId, traitType, value). */
export async function upsertRarity(prisma: PrismaClient, collectionId: number, rarity: RarityMap) {
  const rows: { traitType: string; value: string; count: number; pct: number }[] = [];
  for (const [traitType, axis] of rarity) {
    for (const [value, { count, pct }] of axis) rows.push({ traitType, value, count, pct });
  }
  for (const part of chunk(rows, CHUNK)) {
    const values: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    for (const r of part) {
      values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},now())`);
      params.push(collectionId, r.traitType, r.value, r.count, r.pct);
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AttributeRarity" ("collectionId","traitType","value","count","rarityPct","updatedAt")
       VALUES ${values.join(",")}
       ON CONFLICT ("collectionId","traitType","value") DO UPDATE SET
         "count"=EXCLUDED."count","rarityPct"=EXCLUDED."rarityPct","updatedAt"=now()`,
      ...params
    );
  }
}

/** address → id для items коллекции (одним запросом). */
export async function getItemIdMap(prisma: PrismaClient, collectionId: number): Promise<Map<string, number>> {
  const rows = await prisma.$queryRawUnsafe<{ id: number; address: string }[]>(
    `SELECT "id","address" FROM "NftItem" WHERE "collectionId"=$1`,
    collectionId
  );
  return new Map(rows.map((r) => [r.address, r.id]));
}

export type { Attribute };
