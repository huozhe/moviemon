import { and, asc, eq, isNull, lt, notInArray, or, sql } from "drizzle-orm";
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
/** After a 429 on a title, skip that id for this long (next runs). */
const RATE_LIMIT_COOLDOWN_MS = 2 * 60 * 60 * 1000;

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
 * - Cooldown: titles named in recent 429 errors are skipped ~2h
 */
export async function syncAvailability(
  limit = BATCH_LIMIT,
): Promise<SyncAvailabilityResult> {
  const startedAt = new Date();
  const db = getDb();

  try {
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

    const cooldownIds = await loadRateLimitCooldownIds(db);
    const staleBefore = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);

    const filters = [
      eq(watchlistItems.onList, true),
      or(
        isNull(watchlistItems.availabilityCheckedAt),
        lt(watchlistItems.availabilityCheckedAt, staleBefore),
      ),
    ];
    if (cooldownIds.length > 0) {
      filters.push(notInArray(watchlistItems.imdbId, cooldownIds));
    }

    const candidates = await db
      .select({
        imdbId: watchlistItems.imdbId,
        watchmodeId: titles.watchmodeId,
      })
      .from(watchlistItems)
      .innerJoin(titles, eq(titles.imdbId, watchlistItems.imdbId))
      .where(and(...filters))
      .orderBy(
        sql`case when ${watchlistItems.availabilityCheckedAt} is null then 0 else 1 end`,
        // Rotate among never-checked so one failing id is not always first
        asc(watchlistItems.imdbId),
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
          // Stop the batch — further calls will likely 429 too
          break;
        }

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
        cooldownSkipped: cooldownIds.length,
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

/** IDs mentioned in recent rate-limit errors — skip for RATE_LIMIT_COOLDOWN_MS. */
async function loadRateLimitCooldownIds(
  db: ReturnType<typeof getDb>,
): Promise<string[]> {
  const since = new Date(Date.now() - RATE_LIMIT_COOLDOWN_MS);
  const rows = await db
    .select({
      error: syncRuns.error,
      stats: syncRuns.stats,
      startedAt: syncRuns.startedAt,
    })
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.kind, "availability"),
        sql`${syncRuns.startedAt} >= ${since}`,
      ),
    )
    .orderBy(sql`${syncRuns.startedAt} desc`)
    .limit(15);

  const ids = new Set<string>();
  for (const r of rows) {
    const stats = r.stats as { rateLimited?: boolean } | null;
    const looks429 =
      stats?.rateLimited === true ||
      (typeof r.error === "string" && r.error.includes("429"));
    if (!looks429 || !r.error) continue;
    for (const m of r.error.matchAll(/\b(tt\d{7,})\b/g)) {
      ids.add(m[1]);
    }
  }
  return [...ids];
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

  await db
    .update(watchlistItems)
    .set({ availabilityCheckedAt: now })
    .where(eq(watchlistItems.imdbId, imdbId));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
