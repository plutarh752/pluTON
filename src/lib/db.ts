import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Neon driver adapter: Prisma ходит в БД по 443 (а не по TCP 5432).
// Это штатный паттерн для Neon (в т.ч. Vercel serverless), а не костыль под машину.
neonConfig.webSocketConstructor = ws;
// Обычные (не-транзакционные) запросы гоним по HTTP fetch, а не по WebSocket —
// иначе под webpack-бандлом Next.js ломается ws-маскирование (bufferUtil.mask).
neonConfig.poolQueryViaFetch = true;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString });
  const adapter = new PrismaNeon(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
