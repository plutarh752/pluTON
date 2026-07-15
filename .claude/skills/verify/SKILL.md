---
name: verify
description: Verify PluTON v2 (Next.js gift price tracker) end-to-end by driving the running app — showcase + presets + price run.
---

# Verify PluTON v2 end-to-end

Surface = server-rendered web GUI (Next 15 App Router) + JSON API routes.
Observe by driving the dev server, not by importing functions.

## Launch

```bash
PORT=3111 npm run dev   # background; needs .env with DATABASE_URL + GIFT_SATELLITE_KEY
```
Poll `curl -s -o /dev/null -w '%{http_code}' http://localhost:3111/` until `200`.
`POST /api/prices` **spawns `worker/prices.ts`** as a local detached process (invariant 4).

## Drive the price flow (the витрина engine)

1. `GET /api/prices` → check `running`, `cooldownLeft`, `marketStatus` (keyed by **presetId**).
2. `POST /api/prices` → `202 {ok:true}` triggers a run. **Gotcha:** the running-guard row is
   created by the *worker*, not the route, so two rapid POSTs both pass and spawn two workers
   (runIds jump, e.g. 9→11). POST once, then poll.
3. Poll `GET /api/prices` until `running:false`; a real run is ~25s (live gift-satellite,
   preset × 5 markets × each backdrop; `tg` throttled 1/1.5s). `durationMs` in `PriceRun`.
4. `GET /` → showcase HTML. Strip tags (python regex) and check: one column per preset (IDX 001…),
   **a section per backdrop** inside each column (dark→light via `sortBackdropsDarkToLight` —
   render order differs from stored `backdropNames` order), `N.NN× floor` chip (= price/floor),
   price triple `TON · ⭐Stars · ~$`.

## Presets surface

- `GET /presets` → form has **«Фоны»** multi-select + «Floor коллекции» preview; list shows
  «Фоны (N)» chips per preset.
- `GET /api/preview?collection=<name>&model=<name>` → `{imageUrl, floorTon, floorUsd, floorStars}`;
  no `collection` ⇒ `400 collection_required`; unknown collection ⇒ `200` all-null (graceful).
- **`POST /api/presets` is an UPSERT on (collectionName, modelName)** — `{updated:true}`, **no 409**;
  it **replaces** `backdropNames` wholesale. Probing a duplicate overwrites real data → back up
  `Preset` rows first and restore via another POST. Unique index: `Preset_collectionName_modelName_key`.

## DB state / migration

Neon over HTTP driver only (invariant 1) — no direct 5432. Read raw with
`prisma.$queryRawUnsafe` and cast `information_schema` `name` columns to `::text`
(else P2010 deserialize error). Multi-backdrop schema = `Preset.backdropNames String[]`
(migration `scripts/migrate-backdrops.ts`, already applied in prod).

## Don't

Don't run `npm test`/`typecheck` as verification — drive the app. Kill the dev server when done
(`lsof -ti:3111 | xargs kill`).
