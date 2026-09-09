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
# optional login: SITE_PASSWORD + AUTH_SECRET (both, or neither)

npm install
npm run db:push          # or db:generate && db:migrate
npm run seed             # seed Netflix / Max / Prime / YouTube TV
npm run dev
```

### Login (shared password)

When `SITE_PASSWORD` is set, the site redirects unauthenticated visitors to `/login`. A signed httpOnly cookie session lasts 30 days.

| Env | Purpose |
|-----|---------|
| `SITE_PASSWORD` | Shared password (omit to leave the site open — fine for local) |
| `AUTH_SECRET` | Signs the session JWT — **required** when `SITE_PASSWORD` is set (`openssl rand -base64 32`) |

Cron and `POST /api/sync` still use `Authorization: Bearer $CRON_SECRET` and skip the cookie. `AUTH_SECRET` is deliberately separate: `CRON_SECRET` travels through curl commands and shell history, so it must not also sign login sessions.

Failed logins are throttled per IP (10 per 15 minutes). The counter lives in process memory, so on serverless it is per instance — choose a strong `SITE_PASSWORD`. Rotating `AUTH_SECRET` invalidates every existing session; changing `SITE_PASSWORD` alone does not.

### Bootstrap exports (optional, once)

Put one-time exports under [`bootstrap/`](bootstrap/README.md) (gitignored):

| File | How to import |
|------|----------------|
| `bootstrap/notion_watchlist.md` | `npm run import:notion` (Want to Watch only) |
| `bootstrap/imdb_watchlist.csv` | `POST /api/sync` with `csvText`, or host + `IMDB_WATCHLIST_CSV_URL` |

IMDb serves AWS WAF challenges to server-side page fetches, so there is no watchlist scraper — export the CSV yourself. Title metadata comes from IMDb's public GraphQL endpoint.

```bash
# Notion markdown export
npm run import:notion

# IMDb CSV (example)
curl -X POST "$ORIGIN/api/sync" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"kind":"watchlist","csvText":"<paste full CSV>"}'
```

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

Watchlist API (requires login cookie when `SITE_PASSWORD` is set):

- `POST /api/watchlist` `{"imdbId":"tt…"}` — add
- `DELETE /api/watchlist` `{"imdbId":"tt…"}` — soft-remove

## Deploy

1. Connect this GitHub repo to Vercel.
2. Marketplace → **Neon** (free) → inject `DATABASE_URL`.
3. Set `WATCHMODE_API_KEY`, `CRON_SECRET`, `SITE_PASSWORD`, `AUTH_SECRET` (distinct values).
4. Run migrations + `npm run seed` (or a one-off against prod `DATABASE_URL`).
5. Bootstrap once from CSV if the DB is empty; then manage the list in the UI.
6. Hit availability cron once with the Bearer secret.
7. Open the site → log in with `SITE_PASSWORD`.

## Hard rules

- MovieMon/Neon is the watchlist source of truth.
- IMDb CSV import must **not** soft-remove titles missing from the export.
- Available = enabled provider + monotype in `flatrate` / `free` / `ads`.

## Security

Single shared password, no user accounts — it keeps a personal list private, not much more. Report anything you find by opening an issue.

- Set `SITE_PASSWORD` **and** `AUTH_SECRET` together, and keep `AUTH_SECRET` distinct from `CRON_SECRET`.
- Never commit `.env.local` or anything under `bootstrap/` — both are gitignored, and the exports hold personal viewing history.
- Keep `next` patched; the auth gate is `proxy.ts`, and proxy/middleware-bypass advisories defeat it outright.

## License

[MIT](LICENSE) © Zheng Liu
