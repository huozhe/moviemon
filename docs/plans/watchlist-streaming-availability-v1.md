# MovieMon v1 — personal watchlist + streaming availability

**Status:** Shipped. Kept as the design record for v1.  
**Date:** 2026-07-18 · **Last updated:** 2026-09-09  
**Scope:** Single-tenant personal tool, US region, four providers  
**Repo:** https://github.com/huozhe/moviemon

> This is a design document, not a manual. It records why v1 is shaped the way
> it is, including decisions later revised. For setup and usage see the
> [README](../../README.md).

## Problem

I subscribe to **Max**, **Netflix**, **Prime Video**, and **YouTube TV**. I need a simple site that **owns my watchlist** and answers:

> Which titles on **my MovieMon watchlist** can I watch right now on services I already pay for?

## Goals

1. Store and manage the watchlist in **Neon** (this site is the source of truth).
2. Optional **one-time** bootstrap from an IMDb CSV export (additive only; never a recurring mirror).
3. Resolve US streaming availability for each title against my four subscriptions.
4. Show **Available now** vs **Not available** in a couch-friendly web UI (search, filter, sort, posters, ratings, plot; add/remove titles).
5. Refresh **availability** on a schedule with minimal manual work.

## Non-goals (v1)

- Multi-user accounts (a shared-password gate was added after v1 — see [Auth, revisited](#auth-revisited))
- Ongoing daily re-import from IMDb
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
| Jobs | Vercel Cron (**availability only**) |
| Database | **Neon Postgres** via Vercel Marketplace (free plan) |
| Watchlist SoT | **Neon `watchlist_items`** — add via UI / `POST /api/watchlist`; remove via UI / `DELETE /api/watchlist` |
| IMDb role | Metadata (GraphQL) + **optional one-time CSV bootstrap** (`csvText` or `IMDB_WATCHLIST_CSV_URL`). Import is **additive**; never soft-removes. HTML scrape removed (AWS WAF). |
| Title metadata | Bootstrap CSV columns when present; **GraphQL** `graphql.imdb.com` for add-by-id + gap-fill (poster, plot, rating/runtime, seasons) |
| Auth | **Shared password** (`SITE_PASSWORD` + `AUTH_SECRET` session cookie) when configured; site open if password unset. Gate lives in `proxy.ts`. Cron/manual sync still use `CRON_SECRET`, which must differ from `AUTH_SECRET` |
| Region | US |
| Providers | Max, Netflix, Prime Video, YouTube TV |
| Availability data | Watchmode (IMDb ID → sources) |

### Why web, not Android (v1)

Core job is read + filter + link out. A website ships faster, works on phone and laptop, and avoids Play Store overhead.

### Why Neon on Vercel

Standalone Vercel Postgres is discontinued. New projects provision Postgres from the [Vercel Marketplace](https://vercel.com/docs/postgres). Prefer `@neondatabase/serverless` + Drizzle — **not** legacy `@vercel/postgres`.

### Auth, revisited

v1 shipped with no login: single-tenant, personal, anyone with the URL could read the list.
That was revised. The site now supports an optional shared password (`SITE_PASSWORD`)
with a signed httpOnly session cookie (`AUTH_SECRET`). Leave `SITE_PASSWORD` unset and
the original open behaviour returns, which is still the convenient default for local dev.

`AUTH_SECRET` is intentionally separate from `CRON_SECRET`: the cron token appears in
curl examples and shell history, so it must not also be able to mint sessions. Failed
logins are throttled per IP in process memory — per instance on serverless, not global.

### IMDb constraint (updated)

IMDb has **no** personal “my watchlist” API for normal apps. Official IMDb API (AWS Data Exchange) is commercial **title metadata**, not account lists.

**HTML scrape is not viable (2026):** `www.imdb.com` serves AWS WAF challenges (HTTP 202, `x-amzn-waf-action: challenge`) to non-browser clients.

**Product decision:** MovieMon does **not** try to stay in lockstep with IMDb. The list lives here. IMDb is:

1. Optional **bootstrap**: one CSV import (additive upsert; **no** soft-remove of missing ids).
2. **Metadata** source via GraphQL when adding a title by id, and for gap-fill.

## Architecture

```text
Web (open, or shared-password gated via proxy.ts)
        │
        ▼
┌───────────────────────────────────────────┐
│  Next.js on Vercel                        │
│  GET /              Available now         │
│  GET /unavailable   Checked, not on svcs  │
│  GET /settings      Add title + sync log  │
│                                           │
│  POST/DELETE /api/watchlist  list edits   │
│  GET /api/cron/sync-availability          │
│  POST /api/sync     manual (secret)       │
│  (bootstrap) POST watchlist csv once      │
└─────────────┬───────────────┬─────────────┘
              │               │
              ▼               ▼
     Neon Postgres      External fetches
     (Marketplace)      1) GraphQL imdb.com (meta)
     watchlist SoT      2) Watchmode US offers
                        3) IMDb CSV bootstrap only
```

### Layer responsibilities

| Layer | Responsibility |
|-------|----------------|
| UI | List/filter/sort; add/remove; posters; rating/runtime/plot; provider badges + deep links; pending count |
| Watchlist manage | Add by IMDb id (GraphQL meta); soft-remove (`on_list=false`) |
| Bootstrap import | Optional CSV → upsert titles + set `on_list`; **never** soft-remove missing |
| Sync (availability) | Never-checked / stale `on_list` titles → Watchmode offers; stop cleanly on 429 |
| DB | Source of truth for list membership + cached meta/offers; no external APIs on page view |
| Cron | Daily **availability** only; `CRON_SECRET` |

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

## IMDb bootstrap pull (CSV, optional once)

### Config

```bash
# Preferred
IMDB_WATCHLIST_CSV_URL=https://gist.githubusercontent.com/.../raw/.../watchlist.csv

# Optional one-off: POST /api/sync body { "kind": "watchlist", "csvText": "..." }
# IMDB_WATCHLIST_URL was removed — IMDb serves AWS WAF challenges to server fetches.
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

### Bootstrap algorithm (`sync-watchlist` — manual only)

1. `remote = parseWatchlistCsv(csvText)` or `fetchWatchlist()` (optional URL)
2. Upsert `titles` (including CSV rating/runtime when present); set `watchlist_items.on_list = true`, `last_seen_at = now()`
3. **Never** soft-remove titles missing from the CSV (MovieMon is SoT; remove only via UI/API)
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
    { "path": "/api/cron/sync-availability", "schedule": "30 15 * * *" }
  ]
}
```

(~8:30 AM PT → 15:30 UTC.) Watchlist cron is **disabled** — list is not re-imported.

Secure cron handlers with `Authorization: Bearer ${CRON_SECRET}`.

Manual: `POST /api/sync` with same secret (or `SYNC_SECRET`), body `{ "kind": "availability" | "watchlist" | "both", "csvText"?: "..." }`. Prefer `availability` day-to-day; `watchlist` only for bootstrap.

## Routes (v1)

| Path | Access | Purpose |
|------|--------|---------|
| `/` | Cookie¹ | Available on enabled services |
| `/unavailable` | Cookie¹ | Checked, not on those services (+ pending banner) |
| `/settings` | Cookie¹ | Add title, providers, stats, sync log |
| `/login` | Open | Shared-password form |
| `POST /api/watchlist` | Cookie¹ | Add / re-add title by IMDb id |
| `DELETE /api/watchlist` | Cookie¹ | Soft-remove from list |
| `POST /api/auth/login` | Open, throttled | Exchange password for a session cookie |
| `POST /api/auth/logout` | Open | Clear the session cookie |
| `/api/cron/sync-availability` | `CRON_SECRET` | Offers refresh |
| `/api/sync` | Secret | Manual sync / optional CSV bootstrap |
| `/api/cron/sync-watchlist` | `CRON_SECRET` | Bootstrap endpoint still exists; **not** cron-scheduled |

## Repo layout (as shipped)

```text
moviemon/
  proxy.ts                  # auth gate (was middleware.ts before Next 16)
  app/
    page.tsx                # Available now
    unavailable/page.tsx
    settings/page.tsx
    login/page.tsx
    api/auth/login/route.ts
    api/auth/logout/route.ts
    api/cron/sync-availability/route.ts
    api/cron/sync-watchlist/route.ts   # bootstrap only; not scheduled
    api/sync/route.ts
    api/watchlist/route.ts
  components/
    TitleCard.tsx
    TitleBrowser.tsx        # search, filter, sort
    TitleList.tsx
    AddTitleForm.tsx
    RemoveTitleButton.tsx
    LoginForm.tsx
    LogoutButton.tsx
    PlotExpand.tsx
    ProviderBadges.tsx
    RelativeTime.tsx
    SiteNav.tsx
    PageHeader.tsx
  lib/
    auth/session.ts         # password check, JWT sign/verify
    auth/rate-limit.ts      # per-IP login throttle
    db/schema.ts
    db/index.ts
    imdb/watchlist-client.ts  # CSV parse + fetch
    imdb/ratings.ts           # GraphQL meta
    availability/watchmode.ts
    availability/providers.ts
    sync/sync-watchlist.ts    # bootstrap import (additive)
    sync/sync-availability.ts
    sync/auth.ts              # constant-time bearer check
    watchlist/manage.ts       # add / remove
    titles/queries.ts
  scripts/
    seed-providers.ts
    import-notion-watchlist.ts
  bootstrap/                # gitignored export dumps (README tracked)
  docs/plans/
  vercel.json
  drizzle.config.ts
  .env.example
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

# Optional one-time CSV bootstrap only (not ongoing SoT)
# IMDB_WATCHLIST_CSV_URL=

# Availability
WATCHMODE_API_KEY=

# Shared-password login (added after v1; omit both to leave the site open)
SITE_PASSWORD=
AUTH_SECRET=
```

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
| IMDb HTML | Scraper removed entirely — WAF made it unusable. CSV import only |
| Watchmode quota (429) | Stop batch (`partial`); keep progress; **cooldown ~2h** on titles named in recent 429 errors so the same id is not hammered every run |
| GraphQL meta fail | Skip title meta; do not fail whole watchlist sync |
| Cron timeout | Small LIMIT + never-checked first |
| YTTV missing from API | Document gap; still show Max/Netflix/Prime |
| False “available” | Only subscription-ish monotypes |

## Build sequence (status)

1. ~~Spike public HTML~~ → **replaced by CSV** after WAF.
2. **Skeleton** — Next.js + Neon + schema + seed — **done**.
3. **Watchlist path** — CSV + gap-fill meta + UI — **done**.
4. **Availability path** — cron + available/unavailable — **done** (catch-up may still be partial under quota).
5. **Polish** — filters, sort, posters, ratings, plot, relative sync times, page titles, TV `m/ep` — **done** for the first review pass.

## Shelved backlog (do not build yet)

Recorded from product review + API research. Implement only when explicitly pulled.

| Idea | Notes / findings | Priority if revived |
|------|------------------|---------------------|
| **Unavailable-tab enrichment** | Drop redundant “Not on your services” pill; optionally show rent/buy or other services not in enabled set. Schema already allows rent/buy monotypes; today we only surface enabled subscription-ish offers. | Highest product value among shelved |
| **“Pick something for me”** | Random available title; cheap delight. | Low effort |
| **Watched / hide** | Soft-hide without deleting from list (separate from Remove). | Medium product decision |
| **“Leaving soon” badge** | **Not available on free Watchmode.** `/title/{id}/sources` has no end/leave/expires fields (only source, type, region, urls, format, price, seasons, episodes). `/releases` has **arrival** `source_release_date`, not departures. `/changes` is **paid-only** (401 on free). DIY alternative later: detect offer **drops** between daily syncs (retrospective, not calendar “leaving”). Other vendors may expose expiring windows. | Blocked on free Watchmode |
| **Provider enable toggles in Settings UI** | DB has `providers.enabled`; seed only today. | Medium |
| **Sort by recently seen on list** | `last_seen_at` already stored. | Low |
| **Trakt (or similar) list source** | True API automation instead of CSV re-export. | Medium |
| ~~**Auth / deployment protection**~~ | **Done.** Shared password + session cookie; Vercel Deployment Protection covers previews. | Shipped |
| **PWA / push** | Out of v1. | Future plan |

## Deploy checklist

1. GitHub → Vercel project connected.
2. Marketplace → **Neon** → `DATABASE_URL`.
3. Set `WATCHMODE_API_KEY`, `CRON_SECRET`.
4. `db:push` (or migrate) + `npm run seed`.
5. Bootstrap once from IMDb CSV if DB empty (additive `POST /api/sync` with `csvText`).
6. Manage list in UI going forward; trigger availability cron with Bearer secret.
7. Spot-check `/` vs real catalogs; note YTTV gaps.

## Success criteria (v1 done when)

- [x] MovieMon/Neon is the watchlist source of truth (add/remove in UI; no daily IMDb re-import).
- [x] CSV bootstrap (if used) is additive only — never soft-removes.
- [x] Site is readable with no login when `SITE_PASSWORD` is unset, and gated when it is set.
- [ ] Available / Unavailable split matches spot-checks for Netflix, Max, and Prime.
- [ ] YouTube TV validated or explicitly documented as partial.
- [x] Failed bootstrap import never wipes `on_list`.
- [ ] Pending availability catch-up ≈ 0 under normal Watchmode quota (or accepted lag documented).

## Future plans (out of scope here)

See **Shelved backlog** above for near-term parked ideas. Separate docs under `docs/plans/` when larger:

- Auth / deployment protection
- PWA + web push (“title just landed on Max”)
- Trakt (or similar) as automated list source
- Alternate availability providers (if leave dates or better YTTV needed)
- Android deep-link shell
