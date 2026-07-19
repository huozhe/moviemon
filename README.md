# MovieMon

Personal Next.js site that tracks **your** watchlist and shows which titles are available on **Max**, **Netflix**, **Prime Video**, and **YouTube TV** (US).

**Source of truth:** Neon (`watchlist_items` / this site). IMDb is used for a one-time CSV bootstrap and for title metadata — not as an ongoing mirror.

Design: [`docs/plans/watchlist-streaming-availability-v1.md`](docs/plans/watchlist-streaming-availability-v1.md)

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Neon Postgres (Vercel Marketplace) + Drizzle ORM
- Vercel Cron for daily **availability** refresh
- Watchmode for streaming offers by IMDb ID
- IMDb GraphQL for title meta (and optional CSV bootstrap)

## Local setup

```bash
cp .env.example .env.local
# fill DATABASE_URL, CRON_SECRET, WATCHMODE_API_KEY

npm install
npm run db:push          # or db:generate && db:migrate
npm run seed             # seed Netflix / Max / Prime / YouTube TV
npm run dev
```

### Bootstrap from IMDb (optional, once)

If you already have titles in Neon, skip this.

1. Open your IMDb watchlist → **⋯** → **Export**
2. One-shot import (preferred):

```bash
curl -X POST "$ORIGIN/api/sync" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"kind":"watchlist","csvText":"<paste full CSV>"}'
```

Or set `IMDB_WATCHLIST_CSV_URL` and call `POST /api/sync` with `{"kind":"watchlist"}`.

Import is **additive only** — it never removes titles from MovieMon. Day-to-day adds/removes are done in the UI (Settings → Add; **Remove** on cards).

### Ongoing list management

| Action | How |
|--------|-----|
| Add title | Settings → paste `tt…` or IMDb title URL |
| Remove title | **Remove** on Available / Unavailable cards |
| Refresh streams | Daily cron or `POST /api/sync` `{"kind":"availability"}` |

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run db:push` | Push schema to Neon (dev) |
| `npm run db:generate` / `db:migrate` | Migration workflow |
| `npm run seed` | Seed four providers |

## Cron

Configured in `vercel.json`:

- `GET /api/cron/sync-availability` — daily (~15:30 UTC)

Requires `Authorization: Bearer $CRON_SECRET`. Watchlist cron is **disabled** (list is not re-imported).

Manual: `POST /api/sync` with the same auth and body `{"kind":"availability"}`.

Watchlist API (no auth; personal single-tenant):

- `POST /api/watchlist` `{"imdbId":"tt…"}` — add
- `DELETE /api/watchlist` `{"imdbId":"tt…"}` — soft-remove

## Deploy

1. Connect this GitHub repo to Vercel.
2. Marketplace → **Neon** (free) → inject `DATABASE_URL`.
3. Set `WATCHMODE_API_KEY`, `CRON_SECRET`.
4. Run migrations + `npm run seed` (or a one-off against prod `DATABASE_URL`).
5. Bootstrap once from CSV if the DB is empty; then manage the list in the UI.
6. Hit availability cron once with the Bearer secret.

## Hard rules

- MovieMon/Neon is the watchlist source of truth.
- IMDb CSV import must **not** soft-remove titles missing from the export.
- Available = enabled provider + monotype in `flatrate` / `free` / `ads`.
