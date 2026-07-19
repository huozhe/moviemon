# MovieMon v1 — IMDb watchlist streaming availability

**Status:** Draft  
**Date:** 2026-07-18  
**Audience:** Single-user personal tool (California, USA)

## Problem

I subscribe to **Max**, **Netflix**, **Prime Video**, and **YouTube TV**. My watchlist lives on **IMDb**. I need a simple site that answers:

> Which titles on my IMDb watchlist can I watch right now on services I already pay for?

## Goals

1. Automatically pull my **public IMDb watchlist** (no manual CSV as the primary path).
2. Resolve US streaming availability for each title against my four subscriptions.
3. Show **Available now** vs **Not available** in a couch-friendly web UI.
4. Refresh daily with zero manual work after setup.

## Non-goals (v1)

- User login / multi-user accounts
- Private IMDb watchlist (must be public)
- Native Android / iOS apps
- Scraping Netflix/Max/Prime catalogs directly
- Recommendations, social features, ratings AI
- Multi-region support (US only)
- CSV import as primary path (optional emergency fallback later)

## Locked decisions

| Decision | Choice |
|----------|--------|
| Client | Responsive Next.js web app (PWA optional later) |
| Backend | Next.js fullstack (App Router + TypeScript) |
| Hosting | Vercel |
| Jobs | Vercel Cron |
| Database | **Neon Postgres** via Vercel Marketplace (free plan) |
| IMDb source | **Public watchlist URL** (`IMDB_WATCHLIST_URL`) |
| Auth | **None** for browsing; secrets only for cron/manual sync |
| Region | US |
| Providers | Max, Netflix, Prime Video, YouTube TV |
| Availability data | Watchmode (or equivalent API with IMDb ID lookup) |

### Why web, not Android (v1)

Core job is read + filter + link out. A website ships faster with FE/BE skills, works on phone and laptop, and avoids Play Store overhead. Native can wait if deep-linking or offline later justify it.

### Why Neon on Vercel

Standalone Vercel Postgres is discontinued. New projects provision Postgres from the [Vercel Marketplace](https://vercel.com/docs/postgres). **Neon** is the free, one-click option; credentials are injected as env vars. Prefer `@neondatabase/serverless` or Drizzle + Neon driver — do **not** start new code on legacy `@vercel/postgres`.

### Why no login

v1 is single-tenant and personal. Anyone with the URL can see the list. Optional later: Vercel Deployment Protection or a hard-to-guess URL + `noindex`. Do not build NextAuth for v1.

### IMDb constraint

IMDb has **no** personal “my watchlist” API for normal apps. Official IMDb API (AWS Data Exchange) is commercial title metadata, not account lists. v1 therefore:

1. Requires the watchlist to be **public**.
2. Server-fetches `IMDB_WATCHLIST_URL` on a schedule.
3. Parses titles into a stable internal shape.

## Architecture

```text
Public web (no login)
        │
        ▼
┌───────────────────────────────────────────┐
│  Next.js on Vercel                        │
│  GET /              Available now         │
│  GET /unavailable   Still on list         │
│  GET /settings      Providers + Sync now  │
│                                           │
│  GET /api/cron/sync-watchlist             │
│  GET /api/cron/sync-availability          │
│  POST /api/sync     manual (secret)       │
└─────────────┬───────────────┬─────────────┘
              │               │
              ▼               ▼
     Neon Postgres      External fetches
     (Marketplace)      1) Public IMDb watchlist URL
                        2) Watchmode US offers
```

### Layer responsibilities

| Layer | Responsibility |
|-------|----------------|
| UI | List/filter titles; show provider badges; deep links; last-sync status |
| Sync (watchlist) | Fetch public IMDb URL → upsert titles → soft-remove missing |
| Sync (availability) | For `on_list` titles, refresh US offers for enabled providers |
| DB | Cache watchlist + offers; never hit external APIs on every page view |
| Cron | Daily watchlist then availability; secured with `CRON_SECRET` |

## Data model

```sql
-- titles
imdb_id text PRIMARY KEY          -- tt...
name text NOT NULL
year int
title_type text                   -- movie | tv | other
poster_url text
updated_at timestamptz

-- watchlist_items
imdb_id text PRIMARY KEY REFERENCES titles(imdb_id)
on_list boolean NOT NULL DEFAULT true
last_seen_at timestamptz NOT NULL
created_at timestamptz NOT NULL DEFAULT now()

-- providers (seed four rows)
id text PRIMARY KEY               -- netflix | max | prime | youtubetv
name text NOT NULL
external_id text                  -- id in Watchmode (or chosen API)
enabled boolean NOT NULL DEFAULT true

-- offers
imdb_id text NOT NULL
provider_id text NOT NULL REFERENCES providers(id)
monotype text NOT NULL            -- flatrate | free | ads | rent | buy
web_url text
last_checked_at timestamptz NOT NULL
PRIMARY KEY (imdb_id, provider_id, monotype)

-- sync_runs
id bigserial PRIMARY KEY
kind text NOT NULL                -- watchlist | availability
status text NOT NULL              -- ok | error
started_at timestamptz NOT NULL
finished_at timestamptz
stats jsonb
error text
```

### Available now definition

A title is **available** when:

- `watchlist_items.on_list = true`, and
- there is at least one `offers` row for an **enabled** provider, and
- `monotype` is subscription-ish: `flatrate`, `free`, or `ads` (not rent/buy by default).

## IMDb public watchlist pull

### Config

```bash
IMDB_WATCHLIST_URL=https://www.imdb.com/user/urXXXXXXXX/watchlist
```

Prerequisites:

1. IMDb → Watchlist → privacy → **Public**
2. URL loads in an logged-out / incognito session

### Client contract

```ts
export type WatchlistTitle = {
  imdbId: string; // tt...
  title: string;
  year?: number;
  type?: "movie" | "tv" | "other";
};

export async function fetchPublicWatchlist(
  url: string
): Promise<WatchlistTitle[]>;
```

### Implementation notes

- Run on **Node** runtime (not Edge).
- Fetch with a normal browser-like User-Agent.
- Extract `tt\d+` plus title/year; paginate if needed.
- Prefer stable embedded data over brittle CSS selectors when possible.

### Sync algorithm (`sync-watchlist`)

1. `remote = fetchPublicWatchlist(IMDB_WATCHLIST_URL)`
2. Upsert `titles`; set `watchlist_items.on_list = true`, `last_seen_at = now()`
3. Soft-remove: ids not in `remote` → `on_list = false` **only after a successful full fetch**
4. Write `sync_runs` with counts

**Hard rule:** if the pull fails (HTTP error, parse error, empty unexpected), abort and leave existing `on_list` rows unchanged.

## Availability sync

### Interface

```ts
export type Offer = {
  providerId: string; // netflix | max | prime | youtubetv
  monotype: "flatrate" | "free" | "ads" | "rent" | "buy";
  webUrl?: string;
};

export async function getUSOffers(imdbId: string): Promise<Offer[]>;
```

### Algorithm (`sync-availability`)

1. Select `on_list` titles, prefer stale (`last_checked_at` null or older than ~20h).
2. Batch with rate limits (e.g. 40 per invocation) to stay under serverless timeouts.
3. Replace that title’s offer rows for tracked providers; set `last_checked_at`.
4. Record `sync_runs`.

### Provider seed

| App id | Display | Notes |
|--------|---------|--------|
| `netflix` | Netflix | Map `external_id` from availability API |
| `max` | Max | Formerly HBO Max |
| `prime` | Prime Video | |
| `youtubetv` | YouTube TV | Validate early — live-TV packages are often weaker in catalog APIs |

Region fixed to **US** in code (California does not need a separate locale).

## Vercel Cron

```json
{
  "crons": [
    { "path": "/api/cron/sync-watchlist", "schedule": "0 15 * * *" },
    { "path": "/api/cron/sync-availability", "schedule": "30 15 * * *" }
  ]
}
```

(~8:00 / 8:30 AM PT → 15:00 / 15:30 UTC; adjust if desired.)

Secure every cron handler:

```ts
if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
  return new Response("Unauthorized", { status: 401 });
}
```

Manual **Sync now** on `/settings` calls the same sync functions, gated by `CRON_SECRET` or `SYNC_SECRET` so anonymous visitors cannot burn API quota.

## Routes (v1)

| Path | Access | Purpose |
|------|--------|---------|
| `/` | Public | Available on enabled services |
| `/unavailable` | Public | On list, not on those services |
| `/settings` | Public UI | Providers, last sync, Sync now |
| `/api/cron/sync-watchlist` | `CRON_SECRET` | Daily IMDb pull |
| `/api/cron/sync-availability` | `CRON_SECRET` | Daily offers refresh |
| `/api/sync` | Secret | Manual sync trigger |

## Suggested repo layout

```text
moviemon/
  app/
    page.tsx
    unavailable/page.tsx
    settings/page.tsx
    api/cron/sync-watchlist/route.ts
    api/cron/sync-availability/route.ts
    api/sync/route.ts
  components/
    TitleCard.tsx
    ProviderBadges.tsx
    Filters.tsx
  lib/
    db/schema.ts
    db/index.ts
    imdb/watchlist-client.ts
    availability/watchmode.ts
    availability/providers.ts
    sync/sync-watchlist.ts
    sync/sync-availability.ts
  docs/plans/                    # this folder
  scripts/seed-providers.ts
  vercel.json
  drizzle.config.ts
  .env.example
```

### Stack glue

- Next.js App Router + TypeScript + Tailwind
- Drizzle ORM + Neon serverless driver
- Server Components for list pages
- Node runtime for cron/sync + IMDb fetch

## Environment variables

```bash
# Neon (injected by Vercel Marketplace)
DATABASE_URL=

# Cron / manual sync
CRON_SECRET=

# IMDb
IMDB_WATCHLIST_URL=https://www.imdb.com/user/ur.../watchlist

# Availability
WATCHMODE_API_KEY=
```

No auth-related env vars in v1.

## UI (minimal)

**Available now**

- Title, year, type, provider chips, outbound web link
- Filters: provider multi-select, movie vs TV
- Sort: title, year, recently seen on list

**Unavailable**

- Same list shape with empty providers

**Settings**

- Enabled providers
- Last watchlist / availability sync from `sync_runs`
- Sync now (secret-gated API)

## Failure modes

| Failure | Behavior |
|---------|----------|
| IMDb HTML/export changes | Sync errors; keep last good list |
| Availability API quota | Batch + cache; never call per pageview |
| Cron timeout | Cursor + `LIMIT` on stale titles |
| YTTV missing from API | Document gap; still show Max/Netflix/Prime correctly |
| False “available” | Only count subscription-ish monotypes |

## Build sequence

1. **Spike** — Public URL returns full list; Watchmode returns offers for ~10 IMDb ids including the four providers where possible.
2. **Skeleton** — Next.js + Neon + schema + seed providers.
3. **Watchlist path** — Cron + manual sync → DB → raw list UI.
4. **Availability path** — Cron + join → Available / Unavailable.
5. **Polish** — Filters, deep links, last-sync status.

## Deploy checklist

1. Create app, connect GitHub → Vercel.
2. Marketplace → **Neon** (free) → connect project.
3. Set `IMDB_WATCHLIST_URL`, `WATCHMODE_API_KEY`, `CRON_SECRET`.
4. Make IMDb watchlist public; verify incognito.
5. Run migrations; seed providers + external ids.
6. Trigger cron routes once with Bearer secret.
7. Spot-check `/` against real catalogs.

## Success criteria (v1 done when)

- [ ] Daily cron updates Neon from the public IMDb URL with no manual steps.
- [ ] Site is fully readable with no login.
- [ ] Available / Unavailable split matches spot-checks for Netflix, Max, and Prime.
- [ ] YouTube TV validated or explicitly documented as partial.
- [ ] Failed IMDb fetch never wipes `on_list`.

## Future plans (out of scope here)

Add separate docs under `docs/plans/` when needed, for example:

- Auth / deployment protection
- PWA + web push (“title just landed on Max”)
- CSV fallback import
- Android deep-link shell
- Alternate availability providers
