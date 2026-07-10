// Идём в Neon через тот же driver adapter (HTTP/443), что и веб/воркер —
// прямой TCP 5432 на этой машине заблокирован (инвариант #1, ловили P1017/P1001).
import { prisma } from "../src/lib/db";

// Начальные настройки. Всё редактируется в Settings (Экран 5).
// Веса осей: у Telegram-подарков оси Model/Backdrop/Symbol (не 4 — «Number» это mint-id, см. план §0).
const SETTINGS: Record<string, unknown> = {
  rates: {
    ton_usd: 1.78, // обновляется вживую из tonapi /v2/rates при скане
    stars_usd: 0.013, // для Stars-сегмента (V2)
  },
  fees: {
    getgems_sale_pct: 0.05, // комиссия маркетплейса при продаже
    gas_ton_per_tx: 0.1, // газ на транзакцию
    tg_commission: 0.8, // комиссия Telegram (V2, Stars)
  },
  scan: {
    cooldown_minutes: 15, // legacy tonapi-скан
  },
  prices: {
    cooldown_minutes: 3, // кнопка «Получить цены» (gift-satellite) — лёгкая частая операция
  },
  tonapi: {
    api_key: "", // free tier (1 RPS) ключа не требует
  },
};

// Стартовый watchlist (подтверждён спайком: единый формат осей, цены в TON).
const WATCHLIST = [
  { name: "Plush Pepes", slug: "plush-pepes", address: "EQBG-g6ahkAUGWpefWbx-D_9sQ8oWbvy6puuq78U2c4NUDFS" },
  { name: "Lol Pops", slug: "lol-pops", address: "EQC6zjid8vJNEWqcXk10XjsdDLRKbcPZzbHusuEW6FokOWIm" },
  { name: "Stellar Rockets", slug: "stellar-rockets", address: "EQDIruSTyxvq60gUH8j2kkj3qzoBrBaJy9WkKbeNNRasWe4j" },
  { name: "Scared Cats", slug: "scared-cats", address: "EQATuUGdvrjLvTWE5ppVFOVCqU2dlCLUnKTsu0n1JYm9la10" },
];

async function main() {
  for (const [key, value] of Object.entries(SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as object },
      update: { value: value as object },
    });
  }

  // watchlist храним и как настройку (для UI), и как строки Collection (для FK от листингов).
  await prisma.setting.upsert({
    where: { key: "watchlist" },
    create: { key: "watchlist", value: WATCHLIST },
    update: { value: WATCHLIST },
  });

  for (const c of WATCHLIST) {
    await prisma.collection.upsert({
      where: { address: c.address },
      create: { address: c.address, slug: c.slug, name: c.name },
      update: { name: c.name, slug: c.slug },
    });
  }

  console.log(`Seeded ${Object.keys(SETTINGS).length + 1} settings and ${WATCHLIST.length} collections.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
