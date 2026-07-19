# MovieMon v1 — IMDb watchlist streaming availability

**Status:** In progress (core app shipped; daily CSV automation + full availability catch-up open)  
**Date:** 2026-07-18  
**Last updated:** 2026-07-19  
**Audience:** Single-user personal tool (California, USA)  
**Prod:** https://moviemon-psi.vercel.app · **Repo:** https://github.com/huozhe/moviemon

## Problem

I subscribe to **Max**, **Netflix**, **Prime Video**, and **YouTube TV**. My watchlist lives on **IMDb**. I need a simple site that answers:

> Which titles on my IMDb watchlist can I watch right now on services I already pay for?

## Goals

1. Keep Neon in sync with my IMDb watchlist via a **reliable machine-readable export** (CSV), without relying on fragile HTML scrapes.
2. Resolve US streaming availability for each title against my four subscriptions.
3. Show **Available now** vs **Not available** in a couch-friendly web UI (search, filter, sort, posters, ratings, plot).
4. Refresh on a schedule with minimal manual work after setup (re-export/host CSV when the list changes; crons for sync).

## Non-goals (v1)

- User login / multi-user accounts
- Private IMDb watchlist (export is from the user’s account; list privacy is still recommended public for any HTML fallback)
- Native Android / iOS apps
- Scraping Netflix/Max/Prime catalogs directly
- Recommendations, social features, ratings AI
- Multi-region support (US only)
- Official IMDb AWS Data Exchange (catalog only; not personal watchlists; enterprise pricing)

## Locked decisions

| Decision | Choice |
|----------|--------|
| Client | Responsive Next.js web app (PWA optional later) |
| Backend | Next.js fullstack (App Router + TypeScript) |
| Hosting | Vercel |
| Jobs | Vercel Cron |
| Database | **Neon Postgres** via Vercel Marketplace (free plan) |
| IMDb watchlist source | **`IMDB_WATCHLIST_CSV_URL`** (IMDb ⋯ → Export). Optional one-off `csvText` on `POST /api/sync`. HTML `IMDB_WATCHLIST_URL` is **deprecated** (AWS WAF blocks server fetches). |
| Title metadata | CSV columns when present (rating, votes, runtime); **GraphQL** `graphql.imdb.com` gap-fill for poster, plot, missing rating/runtime |
| Auth | **None** for browsing; secrets only for cron/manual sync |
| Region | US |
| Providers | Max, Netflix, Prime Video, YouTube TV |
| Availability data | Watchmode (IMDb ID → sources) |

### Why web, not Android (v1)

Core job is read + filter + link out. A website ships faster, works on phone and laptop, and avoids Play Store overhead.

### Why Neon on Vercel

Standalone Vercel Postgres is discontinued. New projects provision Postgres from the [Vercel Marketplace](https://vercel.com/docs/postgres). Prefer `@neondatabase/serverless` + Drizzle — **not** legacy `@vercel/postgres`.

### Why no login

v1 is single-tenant and personal. Anyone with the URL can see the list. Optional later: Vercel Deployment Protection or hard-to-guess URL + `noindex`.

### IMDb constraint (updated)

IMDb has **no** personal “my watchlist” API for normal apps. Official IMDb API (AWS Data Exchange) is commercial **title metadata**, not account lists.

**HTML scrape is not viable (2026):** `www.imdb.com` serves AWS WAF challenges (HTTP 202, `x-amzn-waf-action: challenge`) to non-browser clients. Server-side cron cannot load a public watchlist page reliably.

v1 therefore:

1. User exports watchlist as **CSV** from IMDb.
2. Host the CSV at a stable fetchable URL (`IMDB_WATCHLIST_CSV_URL`), or one-shot `POST` with `csvText`.
3. Server parses titles + optional rating/votes/runtime into Neon.
4. Soft-remove missing ids only after a **successful full** parse.

## Architecture

```text
Public web (no login)
        │
        ▼
┌───────────────────────────────────────────┐
│  Next.js on Vercel                        │
│  GET /              Available now         │
│  GET /unavailable   Checked, not on svcs  │
│  GET /settings      Providers + sync log  │
│                                           │
│  GET /api/cron/sync-watchlist             │
│  GET /api/cron/sync-availability          │
│  POST /api/sync     manual (secret)       │
└─────────────┬───────────────┬─────────────┘
              │               │
              ▼               ▼
     Neon Postgres      External fetches
     (Marketplace)      1) IMDb CSV (hosted URL)
                        2) GraphQL imdb.com (meta gap-fill)
                        3) Watchmode US offers
```

### Layer responsibilities

| Layer | Responsibility |
|-------|----------------|
| UI | List/filter/sort; posters; rating/runtime/plot; provider badges + deep links; pending count; last-sync status |
| Sync (watchlist) | Fetch/parse CSV → upsert titles (+ CSV ratings) → GraphQL gap-fill → soft-remove missing |
| Sync (availability) | Never-checked / stale `on_list` titles → Watchmode offers; stop cleanly on 429 |
| DB | Cache watchlist, meta, offers; never hit external APIs on page view |
| Cron | Daily watchlist then availability; `CRON_SECRET` |

## Data model

```sql
-- titles
imdb_id text PRIMARY KEY          -- tt...
name text NOT NULL
year int
title_type text                   -- movie | tv | other
runtime_minutes int
plot text
poster_url text                   -- Amazon CDN URL only (not image bytes)
watchmode_id int                  -- cached; skip Watchmode /search
imdb_rating real                  -- 1–10 aggregate
imdb_votes int
rating_fetched_at timestamptz
updated_at timestamptz

-- watchlist_items
imdb_id text PRIMARY KEY REFERENCES titles(imdb_id)
on_list boolean NOT NULL DEFAULT true
last_seen_at timestamptz NOT NULL
availability_checked_at timestamptz  -- set after successful sources call (even if zero offers)
created_at timestamptz NOT NULL DEFAULT now()

-- providers (seed four rows)
id text PRIMARY KEY               -- netflix | max | prime | youtubetv
name text NOT NULL
external_id text                  -- optional Watchmode source id (name-map used today)
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
status text NOT NULL              -- ok | partial | error
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

**Unavailable** = on list, `availability_checked_at` set, and no qualifying offers.  
**Pending** = on list, `availability_checked_at` null (not yet checked / not claimed as unavailable).

## IMDb watchlist pull (CSV)

### Config

```bash
# Preferred
IMDB_WATCHLIST_CSV_URL=https://gist.githubusercontent.com/.../raw/.../watchlist.csv

# Optional one-off: POST /api/sync body { "kind": "watchlist", "csvText": "..." }
# Deprecated (WAF): IMDB_WATCHLIST_URL=https://www.imdb.com/user/.../watchlist
```

Prerequisites:

1. IMDb watchlist → **Export** (CSV with `Const`, `Title`, optional `IMDb Rating`, `Num Votes`, `Runtime (mins)`, etc.).
2. Host file at a URL the Vercel function can `fetch` (Gist raw, object storage, etc.).
3. Re-upload when the list changes (until a better list source exists).

### Client contract

```ts
export type WatchlistTitle = {
  imdbId: string; // tt...
  title: string;
  year?: number;
  type?: "movie" | "tv" | "other";
  imdbRating?: number;
  imdbVotes?: number;
  runtimeMinutes?: number;
};

export async function fetchWatchlist(): Promise<WatchlistTitle[]>;
// prefers IMDB_WATCHLIST_CSV_URL → parseWatchlistCsv
```

### Sync algorithm (`sync-watchlist`)

1. `remote = fetchWatchlist()` (CSV URL or `csvText`)
2. Upsert `titles` (including CSV rating/runtime when present); set `watchlist_items.on_list = true`, `last_seen_at = now()`
3. Soft-remove: ids not in `remote` → `on_list = false` **only after a successful full fetch**
4. GraphQL gap-fill for missing `imdb_rating` / `poster_url` / `runtime_minutes` / `plot` (capped batch)
5. Write `sync_runs` with counts

**Hard rule:** if the pull fails (HTTP/parse/empty unexpected), abort and leave existing `on_list` rows unchanged.

## Availability sync

### Interface

```ts
export type Offer = {
  providerId: string; // netflix | max | prime | youtubetv
  monotype: "flatrate" | "free" | "ads" | "rent" | "buy";
  webUrl?: string;
};

// Uses cached titles.watchmode_id when set (1 sources call vs search+sources)
export async function getUSOffers(
  imdbId: string,
  cachedWatchmodeId?: number | null
): Promise<{ offers: Offer[]; watchmodeId: number | null }>;
```

### Algorithm (`sync-availability`)

1. Backfill `availability_checked_at` from existing offers if needed.
2. Select `on_list` titles where `availability_checked_at` is null or older than ~**7 days**; never-checked first.
3. Batch **~12** per invocation; **~350ms** delay between titles (low Watchmode quota).
4. Per title: `getUSOffers` → replace offer rows → set `availability_checked_at` (even if zero offers); cache `watchmode_id`.
5. On **429**: stop batch, status `partial`, keep progress; do not wipe offers for failed titles.
6. Record `sync_runs` (`ok` | `partial` | `error`).

### Provider seed

| App id | Display | Notes |
|--------|---------|--------|
| `netflix` | Netflix | Name-map from Watchmode today; `external_id` reserved |
| `max` | Max | Formerly HBO Max |
| `prime` | Prime Video | |
| `youtubetv` | YouTube TV | Often weaker in catalog APIs — validate or document partial |

Region fixed to **US** in code.

## Vercel Cron

```json
{
  "crons": [
    { "path": "/api/cron/sync-watchlist", "schedule": "0 15 * * *" },
    { "path": "/api/cron/sync-availability", "schedule": "30 15 * * *" }
  ]
}
```

(~8:00 / 8:30 AM PT → 15:00 / 15:30 UTC.)

Secure cron handlers with `Authorization: Bearer ${CRON_SECRET}`.

Manual sync: `POST /api/sync` with same secret (or `SYNC_SECRET`), body `{ "kind": "watchlist" | "availability" | "both", "csvText"?: "..." }`. Settings UI documents curl (no in-browser secret form).

## Routes (v1)

| Path | Access | Purpose |
|------|--------|---------|
| `/` | Public | Available on enabled services |
| `/unavailable` | Public | Checked, not on those services (+ pending banner) |
| `/settings` | Public UI | Providers, stats, sync log, manual API docs |
| `/api/cron/sync-watchlist` | `CRON_SECRET` | CSV pull + meta gap-fill |
| `/api/cron/sync-availability` | `CRON_SECRET` | Offers refresh |
| `/api/sync` | Secret | Manual sync trigger |

## Repo layout (as shipped)

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
    TitleBrowser.tsx      # search, filter, sort
    PlotExpand.tsx
    ProviderBadges.tsx
    SiteNav.tsx
    PageHeader.tsx
  lib/
    db/schema.ts
    db/index.ts
    imdb/watchlist-client.ts
    imdb/ratings.ts         # GraphQL meta
    availability/watchmode.ts
    availability/providers.ts
    sync/sync-watchlist.ts
    sync/sync-availability.ts
    sync/auth.ts
    titles/queries.ts
  docs/plans/
  scripts/seed-providers.ts
  vercel.json
  drizzle.config.ts
  .env.example
  .grok/STATE.md            # session handoff (tracked in git)
```

### Stack glue

- Next.js App Router + TypeScript + Tailwind
- Drizzle ORM + Neon serverless driver
- Server Components for pages; client browser for filter/sort/plot expand
- Node runtime for cron/sync + external fetches

## Environment variables

```bash
# Neon (injected by Vercel Marketplace)
DATABASE_URL=

# Cron / manual sync
CRON_SECRET=
# SYNC_SECRET=   # optional alternate for POST /api/sync

# IMDb watchlist (CSV primary)
IMDB_WATCHLIST_CSV_URL=
# IMDB_WATCHLIST_URL=   # deprecated; WAF-blocked

# Availability
WATCHMODE_API_KEY=
```

No auth-related env vars in v1.

## UI (shipped)

**Available now**

- Poster, title, year, runtime, IMDb rating, expandable plot
- Provider chips with outbound deep links
- Search; movie/TV filter; provider filter
- Sort: title, year, runtime, rating — re-click field toggles asc/desc
- Nav counts + pending strip when catch-up remains

**Unavailable**

- Same list shape without providers; pending count banner

**Settings**

- List stats, providers enabled, recent `sync_runs`
- Manual sync curl docs (secret-gated API)

## Failure modes

| Failure | Behavior |
|---------|----------|
| IMDb CSV missing / parse error | Sync errors; keep last good `on_list` |
| IMDb HTML (if tried) | WAF 202; clear error; do not wipe list |
| Watchmode quota (429) | Partial batch; progress kept; retry later |
| GraphQL meta fail | Skip title meta; do not fail whole watchlist sync |
| Cron timeout | Small LIMIT + never-checked first |
| YTTV missing from API | Document gap; still show Max/Netflix/Prime |
| False “available” | Only subscription-ish monotypes |

## Build sequence (status)

1. ~~Spike public HTML~~ → **replaced by CSV** after WAF.
2. **Skeleton** — Next.js + Neon + schema + seed — **done**.
3. **Watchlist path** — CSV + gap-fill meta + UI — **done**.
4. **Availability path** — cron + available/unavailable — **done** (catch-up may still be partial under quota).
5. **Polish** — filters, sort, posters, ratings, plot — **done** (provider enable UI + “recently seen” sort still open).

## Deploy checklist

1. GitHub → Vercel project connected.
2. Marketplace → **Neon** → `DATABASE_URL`.
3. Set `IMDB_WATCHLIST_CSV_URL`, `WATCHMODE_API_KEY`, `CRON_SECRET`.
4. Export IMDb CSV; host raw URL; verify fetch from outside.
5. `db:push` (or migrate) + `npm run seed`.
6. Trigger watchlist then availability cron with Bearer secret.
7. Spot-check `/` vs real catalogs; note YTTV gaps.

## Success criteria (v1 done when)

- [ ] Daily cron updates Neon from **hosted CSV** (or documented manual re-export cadence) with no HTML scrape.
- [x] Site is fully readable with no login.
- [ ] Available / Unavailable split matches spot-checks for Netflix, Max, and Prime.
- [ ] YouTube TV validated or explicitly documented as partial.
- [x] Failed watchlist fetch never wipes `on_list`.
- [ ] Pending availability catch-up ≈ 0 under normal Watchmode quota (or accepted lag documented).

## Future plans (out of scope here)

Add separate docs under `docs/plans/` when needed, for example:

- Auth / deployment protection
- PWA + web push (“title just landed on Max”)
- Trakt (or similar) as automated list source
- Provider enable toggles in Settings UI
- Alternate availability providers
- Android deep-link shell
