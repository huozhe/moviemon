import { and, eq, notInArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { titles, watchlistItems, syncRuns } from "@/lib/db/schema";
import {
  fetchWatchlist,
  parseWatchlistCsv,
  type WatchlistTitle,
} from "@/lib/imdb/watchlist-client";

export type SyncWatchlistResult = {
  status: "ok" | "error";
  fetched?: number;
  upserted?: number;
  softRemoved?: number;
  error?: string;
};

/**
 * Pull watchlist → upsert titles → soft-remove missing.
 * On any fetch/parse failure, leave on_list unchanged.
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
    // Hard rule: failed pull must not wipe on_list
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

  for (const t of remote) {
    await db
      .insert(titles)
      .values({
        imdbId: t.imdbId,
        name: t.title,
        year: t.year ?? null,
        titleType: t.type ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: titles.imdbId,
        set: {
          name: t.title,
          year: t.year ?? null,
          titleType: t.type ?? null,
          updatedAt: now,
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

  const stats = {
    fetched: remote.length,
    upserted: remote.length,
    softRemoved: softRemoved.length,
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
