import { and, eq, isNull, notInArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { titles, watchlistItems, syncRuns } from "@/lib/db/schema";
import {
  fetchWatchlist,
  parseWatchlistCsv,
  type WatchlistTitle,
} from "@/lib/imdb/watchlist-client";
import { fetchImdbRating } from "@/lib/imdb/ratings";

export type SyncWatchlistResult = {
  status: "ok" | "error";
  fetched?: number;
  upserted?: number;
  softRemoved?: number;
  ratingsFromCsv?: number;
  ratingsFromGraphql?: number;
  error?: string;
};

const GRAPHQL_GAP_FILL_LIMIT = 80;
const GRAPHQL_DELAY_MS = 100;

/**
 * Pull watchlist → upsert titles (incl. CSV ratings) → GraphQL gap-fill
 * for missing ratings → soft-remove missing list items.
 *
 * @param csvText optional IMDb export CSV body (manual sync bypasses URL fetch)
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
    const error = "Watchlist fetch returned zero titles; aborting soft-remove";
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
  const remoteIds = remote.map((t) => t.imdbId);
  let ratingsFromCsv = 0;

  for (const t of remote) {
    const hasRating = typeof t.imdbRating === "number";
    if (hasRating) ratingsFromCsv += 1;

    const ratingFields = hasRating
      ? {
          imdbRating: t.imdbRating!,
          imdbVotes: t.imdbVotes ?? null,
          ratingFetchedAt: now,
        }
      : {};

    await db
      .insert(titles)
      .values({
        imdbId: t.imdbId,
        name: t.title,
        year: t.year ?? null,
        titleType: t.type ?? null,
        updatedAt: now,
        ...ratingFields,
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

  // Soft-remove only after a successful full fetch
  const softRemoved = await db
    .update(watchlistItems)
    .set({ onList: false })
    .where(
      and(
        eq(watchlistItems.onList, true),
        notInArray(watchlistItems.imdbId, remoteIds),
      ),
    )
    .returning({ imdbId: watchlistItems.imdbId });

  // GraphQL gap-fill: on-list titles still missing a rating
  let ratingsFromGraphql = 0;
  const missing = await db
    .select({ imdbId: titles.imdbId })
    .from(titles)
    .innerJoin(watchlistItems, eq(watchlistItems.imdbId, titles.imdbId))
    .where(
      and(eq(watchlistItems.onList, true), isNull(titles.imdbRating)),
    )
    .limit(GRAPHQL_GAP_FILL_LIMIT);

  for (let i = 0; i < missing.length; i++) {
    const { imdbId } = missing[i];
    if (i > 0) {
      await sleep(GRAPHQL_DELAY_MS);
    }
    try {
      const r = await fetchImdbRating(imdbId);
      if (!r) continue;
      await db
        .update(titles)
        .set({
          imdbRating: r.rating,
          imdbVotes: r.votes,
          ratingFetchedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(titles.imdbId, imdbId));
      ratingsFromGraphql += 1;
    } catch {
      // skip individual failures; keep sync ok
    }
  }

  const stats = {
    fetched: remote.length,
    upserted: remote.length,
    softRemoved: softRemoved.length,
    ratingsFromCsv,
    ratingsFromGraphql,
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
