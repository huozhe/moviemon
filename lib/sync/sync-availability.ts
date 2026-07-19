import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { offers, providers, syncRuns, watchlistItems } from "@/lib/db/schema";
import { getUSOffers } from "@/lib/availability/watchmode";

const BATCH_LIMIT = 100;

export type SyncAvailabilityResult = {
  status: "ok" | "error";
  processed?: number;
  error?: string;
};

/**
 * Refresh US offers for on_list titles in batches (serverless-friendly).
 * Replaces offer rows per title for tracked providers.
 */
export async function syncAvailability(
  limit = BATCH_LIMIT,
): Promise<SyncAvailabilityResult> {
  const startedAt = new Date();
  const db = getDb();

  try {
    const onList = await db
      .select({ imdbId: watchlistItems.imdbId })
      .from(watchlistItems)
      .where(eq(watchlistItems.onList, true))
      .orderBy(asc(watchlistItems.lastSeenAt))
      .limit(limit);

    const enabled = await db
      .select({ id: providers.id })
      .from(providers)
      .where(eq(providers.enabled, true));
    const enabledIds = new Set(enabled.map((p) => p.id));

    let processed = 0;
    const now = new Date();

    for (const { imdbId } of onList) {
      const usOffers = await getUSOffers(imdbId);

      await db.delete(offers).where(eq(offers.imdbId, imdbId));

      const rows = usOffers
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

      processed += 1;
    }

    await db.insert(syncRuns).values({
      kind: "availability",
      status: "ok",
      startedAt,
      finishedAt: new Date(),
      stats: { processed, limit },
    });

    return { status: "ok", processed };
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
