# PluTON

Веб-витрина для флиппинга коллекционных Telegram-подарков (TON NFT). По кнопке «Скан» тянет лоты
и floor'ы из **tonapi.io** (единственный источник в MVP), пишет дельта-снапшот в Postgres, считает
Deal Score и показывает витрину выгодных лотов. Между сканами — read-only из БД.

Полный план и решения: `../.claude/plans/*` (или спроси — держится отдельно). Ключевые факты из
спайка: данные только on-chain (цены в TON), редкость считаем сами (оси Model/Backdrop/Symbol),
продажи выводим кросс-скан дельтами (tonapi не отдаёт priced-историю).

## Стек

Next.js 14 (App Router) + Tailwind + Prisma + PostgreSQL. Скан-джоба — отдельный воркер (`worker/`).

## Локальный запуск

```bash
cp .env.example .env            # при необходимости поправь DATABASE_URL
npm install

# Postgres: подними docker (нужен Docker Desktop) — или укажи свой DATABASE_URL (Neon и т.п.)
docker compose up -d db

npm run prisma:migrate          # применить схему
npm run db:seed                 # настройки + стартовый watchlist
npm run dev                     # http://localhost:3000

# Скан (в каркасе — dry-scan без БД: печатает floor/листинги/редкость):
npm run worker:scan
npm run worker:scan -- EQBG-g6ahkAUGWpefWbx-D_9sQ8oWbvy6puuq78U2c4NUDFS   # одна коллекция
```

## Структура

- `prisma/schema.prisma` — схема с дельта-хранением (`listings` = текущий стейт, `listing_events` = лог дельт).
- `src/app/` — 5 экранов: `scan`, `deals`, `diff`, `collections`, `settings`.
- `src/lib/` — `db`, `format` (пара «валюта + $net»), `scoring` (редкость/expected/deal), `tonapi` (клиент, 1 RPS).
- `worker/` — `scan.ts` (оркестрация), `inferSales.ts` (вменённые продажи).
