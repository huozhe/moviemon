import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  offers,
  providers,
  syncRuns,
  titles,
  watchlistItems,
} from "@/lib/db/schema";
import {
  getUSOffers,
  isRateLimited,
  WatchmodeHttpError,
} from "@/lib/availability/watchmode";

/** Small batches under low Watchmode quotas. */
const BATCH_LIMIT = 12;
/** Skip re-fetch when checked within this window. */
const STALE_HOURS = 24 * 7;
/** Pause between titles to reduce burst 429s. */
const DELAY_MS = 350;

export type SyncAvailabilityResult = {
  status: "ok" | "partial" | "error";
  processed?: number;
  rateLimited?: boolean;
  errors?: Array<{ imdbId: string; error: string }>;
  error?: string;
};

/**
 * Refresh US offers for on_list titles that are never-checked or stale.
 * - Caches Watchmode id on titles (skips search on later runs)
 * - Sets availability_checked_at even when zero offers
 * - Continues past per-title errors; stops the batch on 429
 */
export async function syncAvailability(
  limit = BATCH_LIMIT,
): Promise<SyncAvailabilityResult> {
  const startedAt = new Date();
  const db = getDb();

  try {
    // Titles that already have offer rows were checked before this column existed
    await db.execute(sql`
      UPDATE watchlist_items AS w
      SET availability_checked_at = s.max_checked
      FROM (
        SELECT imdb_id, max(last_checked_at) AS max_checked
        FROM offers
        GROUP BY imdb_id
      ) AS s
      WHERE w.imdb_id = s.imdb_id
        AND w.availability_checked_at IS NULL
    `);

    const staleBefore = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);

    const candidates = await db
      .select({
        imdbId: watchlistItems.imdbId,
        watchmodeId: titles.watchmodeId,
      })
      .from(watchlistItems)
      .innerJoin(titles, eq(titles.imdbId, watchlistItems.imdbId))
      .where(
        and(
          eq(watchlistItems.onList, true),
          or(
            isNull(watchlistItems.availabilityCheckedAt),
            lt(watchlistItems.availabilityCheckedAt, staleBefore),
          ),
        ),
      )
      .orderBy(
        sql`case when ${watchlistItems.availabilityCheckedAt} is null then 0 else 1 end`,
        asc(watchlistItems.availabilityCheckedAt),
      )
      .limit(limit);

    const enabled = await db
      .select({ id: providers.id })
      .from(providers)
      .where(eq(providers.enabled, true));
    const enabledIds = new Set(enabled.map((p) => p.id));

    let processed = 0;
    let rateLimited = false;
    const errors: Array<{ imdbId: string; error: string }> = [];
    const now = new Date();

    for (let i = 0; i < candidates.length; i++) {
      const { imdbId, watchmodeId } = candidates[i];

      if (i > 0 && DELAY_MS > 0) {
        await sleep(DELAY_MS);
      }

      try {
        await refreshOneTitle(db, {
          imdbId,
          cachedWatchmodeId: watchmodeId,
          enabledIds,
          now,
        });
        processed += 1;
      } catch (err) {
        if (isRateLimited(err)) {
          rateLimited = true;
          errors.push({
            imdbId,
            error: err instanceof Error ? err.message : String(err),
          });
          break;
        }

        // Invalid cached id → clear and retry once
        if (
          err instanceof WatchmodeHttpError &&
          (err.status === 404 || err.status === 400) &&
          watchmodeId != null
        ) {
          try {
            await db
              .update(titles)
              .set({ watchmodeId: null, updatedAt: now })
              .where(eq(titles.imdbId, imdbId));
            await refreshOneTitle(db, {
              imdbId,
              cachedWatchmodeId: null,
              enabledIds,
              now,
            });
            processed += 1;
            continue;
          } catch (retryErr) {
            if (isRateLimited(retryErr)) {
              rateLimited = true;
              errors.push({
                imdbId,
                error:
                  retryErr instanceof Error
                    ? retryErr.message
                    : String(retryErr),
              });
              break;
            }
            errors.push({
              imdbId,
              error:
                retryErr instanceof Error ? retryErr.message : String(retryErr),
            });
            continue;
          }
        }

        errors.push({
          imdbId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const status: SyncAvailabilityResult["status"] = rateLimited
      ? "partial"
      : errors.length > 0 && processed === 0
        ? "error"
        : errors.length > 0
          ? "partial"
          : "ok";

    const errorSummary =
      errors.length > 0
        ? errors.map((e) => `${e.imdbId}: ${e.error}`).join("; ")
        : null;

    await db.insert(syncRuns).values({
      kind: "availability",
      status,
      startedAt,
      finishedAt: new Date(),
      stats: {
        processed,
        limit,
        candidateCount: candidates.length,
        rateLimited,
        errorCount: errors.length,
        staleHours: STALE_HOURS,
      },
      error: errorSummary,
    });

    return {
      status,
      processed,
      rateLimited,
      errors: errors.length > 0 ? errors : undefined,
      error: status === "error" ? (errorSummary ?? "unknown error") : undefined,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    try {
      await db.insert(syncRuns).values({
        kind: "availability",
        status: "error",
        startedAt,
        finishedAt: new Date(),
        error,
      });
    } catch {
      // ignore secondary failure
    }
    return { status: "error", error };
  }
}

async function refreshOneTitle(
  db: ReturnType<typeof getDb>,
  opts: {
    imdbId: string;
    cachedWatchmodeId: number | null;
    enabledIds: Set<string>;
    now: Date;
  },
) {
  const { imdbId, cachedWatchmodeId, enabledIds, now } = opts;
  const result = await getUSOffers(imdbId, cachedWatchmodeId);

  if (result.watchmodeId != null) {
    await db
      .update(titles)
      .set({ watchmodeId: result.watchmodeId, updatedAt: now })
      .where(eq(titles.imdbId, imdbId));
  }

  await db.delete(offers).where(eq(offers.imdbId, imdbId));

  const rows = result.offers
    .filter((o) => enabledIds.size === 0 || enabledIds.has(o.providerId))
    .map((o) => ({
      imdbId,
      providerId: o.providerId,
      monotype: o.monotype,
      webUrl: o.webUrl ?? null,
      lastCheckedAt: now,
    }));

  if (rows.length > 0) {
    await db.insert(offers).values(rows);
  }

  // Always mark checked on successful API response (including zero offers)
  await db
    .update(watchlistItems)
    .set({ availabilityCheckedAt: now })
    .where(eq(watchlistItems.imdbId, imdbId));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
