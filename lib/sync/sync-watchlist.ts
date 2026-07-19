import { and, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { titles, watchlistItems, syncRuns } from "@/lib/db/schema";
import {
  fetchWatchlist,
  parseWatchlistCsv,
  type WatchlistTitle,
} from "@/lib/imdb/watchlist-client";
import { fetchImdbTitleMeta } from "@/lib/imdb/ratings";

export type SyncWatchlistResult = {
  status: "ok" | "error";
  fetched?: number;
  upserted?: number;
  /** Always 0 — MovieMon is source of truth; import never removes list items. */
  softRemoved?: number;
  ratingsFromCsv?: number;
  metaFromGraphql?: number;
  error?: string;
};

const GRAPHQL_GAP_FILL_LIMIT = 80;
const GRAPHQL_DELAY_MS = 100;

/**
 * Bootstrap / merge import from an IMDb CSV (or hosted URL).
 *
 * MovieMon (Neon) is the watchlist source of truth. This path only **adds**
 * titles onto the list. It never soft-removes items missing from the CSV —
 * remove titles in the UI instead. Intended as a one-time bootstrap, not a
 * daily mirror of IMDb.
 */
export async function syncWatchlist(
  csvText?: string,
): Promise<SyncWatchlistResult> {
  const startedAt = new Date();
  const db = getDb();

  let remote: WatchlistTitle[];
  try {
    remote = csvText?.trim()
      ? parseWatchlistCsv(csvText)
      : await fetchWatchlist();
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db.insert(syncRuns).values({
      kind: "watchlist",
      status: "error",
      startedAt,
      finishedAt: new Date(),
      error,
    });
    return { status: "error", error };
  }

  if (remote.length === 0) {
    const error = "Watchlist import returned zero titles";
    await db.insert(syncRuns).values({
      kind: "watchlist",
      status: "error",
      startedAt,
      finishedAt: new Date(),
      error,
    });
    return { status: "error", error };
  }

  const now = new Date();
  let ratingsFromCsv = 0;

  for (const t of remote) {
    const hasRating = typeof t.imdbRating === "number";
    const hasRuntime = typeof t.runtimeMinutes === "number";
    if (hasRating) ratingsFromCsv += 1;

    await db
      .insert(titles)
      .values({
        imdbId: t.imdbId,
        name: t.title,
        year: t.year ?? null,
        titleType: t.type ?? null,
        updatedAt: now,
        ...(hasRating
          ? {
              imdbRating: t.imdbRating!,
              imdbVotes: t.imdbVotes ?? null,
              ratingFetchedAt: now,
            }
          : {}),
        ...(hasRuntime ? { runtimeMinutes: t.runtimeMinutes! } : {}),
      })
      .onConflictDoUpdate({
        target: titles.imdbId,
        set: {
          name: t.title,
          year: t.year ?? null,
          titleType: t.type ?? null,
          updatedAt: now,
          ...(hasRating
            ? {
                imdbRating: t.imdbRating!,
                imdbVotes: t.imdbVotes ?? null,
                ratingFetchedAt: now,
              }
            : {}),
          ...(hasRuntime ? { runtimeMinutes: t.runtimeMinutes! } : {}),
        },
      });

    await db
      .insert(watchlistItems)
      .values({
        imdbId: t.imdbId,
        onList: true,
        lastSeenAt: now,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: watchlistItems.imdbId,
        set: {
          onList: true,
          lastSeenAt: now,
        },
      });
  }

  // GraphQL gap-fill: missing rating, poster, runtime, plot, and/or series counts
  let metaFromGraphql = 0;
  const missing = await db
    .select({
      imdbId: titles.imdbId,
      titleType: titles.titleType,
      imdbRating: titles.imdbRating,
      posterUrl: titles.posterUrl,
      runtimeMinutes: titles.runtimeMinutes,
      plot: titles.plot,
      seasonCount: titles.seasonCount,
      episodeCount: titles.episodeCount,
    })
    .from(titles)
    .innerJoin(watchlistItems, eq(watchlistItems.imdbId, titles.imdbId))
    .where(
      and(
        eq(watchlistItems.onList, true),
        or(
          isNull(titles.imdbRating),
          isNull(titles.posterUrl),
          isNull(titles.runtimeMinutes),
          isNull(titles.plot),
          // Season/episode only matter for TV — don't re-poll movies forever
          and(
            or(
              eq(titles.titleType, "tv"),
              sql`lower(coalesce(${titles.titleType}, '')) like '%tv%'`,
              sql`lower(coalesce(${titles.titleType}, '')) like '%series%'`,
            ),
            or(isNull(titles.seasonCount), isNull(titles.episodeCount)),
          ),
        ),
      ),
    )
    .limit(GRAPHQL_GAP_FILL_LIMIT);

  for (let i = 0; i < missing.length; i++) {
    const row = missing[i];
    if (i > 0) await sleep(GRAPHQL_DELAY_MS);
    try {
      const meta = await fetchImdbTitleMeta(row.imdbId);
      const patch: {
        imdbRating?: number;
        imdbVotes?: number | null;
        ratingFetchedAt?: Date;
        posterUrl?: string;
        runtimeMinutes?: number;
        plot?: string;
        seasonCount?: number;
        episodeCount?: number;
        updatedAt: Date;
      } = { updatedAt: new Date() };

      if (row.imdbRating == null && meta.rating != null) {
        patch.imdbRating = meta.rating;
        patch.imdbVotes = meta.votes;
        patch.ratingFetchedAt = new Date();
      }
      if (!row.posterUrl && meta.posterUrl) {
        patch.posterUrl = meta.posterUrl;
      }
      if (row.runtimeMinutes == null && meta.runtimeMinutes != null) {
        patch.runtimeMinutes = meta.runtimeMinutes;
      }
      if (!row.plot && meta.plot) {
        patch.plot = meta.plot;
      }
      if (row.seasonCount == null && meta.seasonCount != null) {
        patch.seasonCount = meta.seasonCount;
      }
      if (row.episodeCount == null && meta.episodeCount != null) {
        patch.episodeCount = meta.episodeCount;
      }

      if (Object.keys(patch).length > 1) {
        await db
          .update(titles)
          .set(patch)
          .where(eq(titles.imdbId, row.imdbId));
        metaFromGraphql += 1;
      }
    } catch {
      // skip individual failures
    }
  }

  const stats = {
    fetched: remote.length,
    upserted: remote.length,
    softRemoved: 0,
    ratingsFromCsv,
    metaFromGraphql,
  };

  await db.insert(syncRuns).values({
    kind: "watchlist",
    status: "ok",
    startedAt,
    finishedAt: new Date(),
    stats,
  });

  return { status: "ok", ...stats };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
