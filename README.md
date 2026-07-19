# MovieMon

Public Next.js site that shows which titles on a public IMDb watchlist are available on **Max**, **Netflix**, **Prime Video**, and **YouTube TV** (US).

Design: [`docs/plans/watchlist-streaming-availability-v1.md`](docs/plans/watchlist-streaming-availability-v1.md)

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Neon Postgres (Vercel Marketplace) + Drizzle ORM
- Vercel Cron for daily watchlist / availability sync
- Watchmode for streaming offers by IMDb ID

## Local setup

```bash
cp .env.example .env.local
# fill DATABASE_URL, CRON_SECRET, IMDB_WATCHLIST_CSV_URL, WATCHMODE_API_KEY

npm install
npm run db:push          # or db:generate && db:migrate
npm run seed             # seed Netflix / Max / Prime / YouTube TV
npm run dev
```

### IMDb watchlist (CSV)

IMDb blocks automated HTML fetches with AWS WAF (HTTP 202 challenge). Use a CSV export:

1. Open your watchlist on IMDb → **⋯** → **Export**
2. Host the `.csv` somewhere fetchable (GitHub Gist **raw** URL works well)
3. Set `IMDB_WATCHLIST_CSV_URL` on Vercel (and in `.env.local`)

One-off without hosting: `POST /api/sync` with JSON  
`{"kind":"watchlist","csvText":"<paste full CSV>"}` and the Bearer secret.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run db:push` | Push schema to Neon (dev) |
| `npm run db:generate` / `db:migrate` | Migration workflow |
| `npm run seed` | Seed four providers |

## Cron

Configured in `vercel.json` (≈ 8:00 / 8:30 AM PT):

- `GET /api/cron/sync-watchlist`
- `GET /api/cron/sync-availability`

Both require `Authorization: Bearer $CRON_SECRET`.

Manual: `POST /api/sync` with the same auth and body `{"kind":"both"}`.

## Deploy

1. Connect this GitHub repo to Vercel.
2. Marketplace → **Neon** (free) → inject `DATABASE_URL`.
3. Set `IMDB_WATCHLIST_URL`, `WATCHMODE_API_KEY`, `CRON_SECRET`.
4. Make the IMDb watchlist **public**; verify in incognito.
5. Run migrations + `npm run seed` (or a one-off against prod `DATABASE_URL`).
6. Hit cron routes once with the Bearer secret.

## Hard rules

- Failed IMDb pull must **not** wipe `on_list`.
- Soft-remove missing titles only after a successful full fetch.
- Available = enabled provider + monotype in `flatrate` / `free` / `ads`.
