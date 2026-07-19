import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { titles, watchlistItems } from "@/lib/db/schema";
import { fetchImdbTitleMeta } from "@/lib/imdb/ratings";

const IMDB_ID_RE = /^tt\d{7,}$/;

export function normalizeImdbId(input: string): string | null {
  const raw = input.trim();
  const fromUrl = raw.match(/tt\d{7,}/)?.[0];
  const id = fromUrl ?? raw;
  return IMDB_ID_RE.test(id) ? id : null;
}

export type AddTitleResult =
  | {
      status: "ok";
      imdbId: string;
      name: string;
      alreadyOnList: boolean;
    }
  | { status: "error"; error: string };

export type RemoveTitleResult =
  | { status: "ok"; imdbId: string }
  | { status: "error"; error: string };

/**
 * Add (or re-add) a title to the MovieMon watchlist.
 * Fetches identity + meta from IMDb GraphQL; does not touch other list items.
 */
export async function addTitleToWatchlist(
  imdbIdOrUrl: string,
): Promise<AddTitleResult> {
  const imdbId = normalizeImdbId(imdbIdOrUrl);
  if (!imdbId) {
    return {
      status: "error",
      error: "Invalid IMDb id (expected tt… or an imdb.com/title/tt… URL)",
    };
  }

  const db = getDb();
  const now = new Date();

  let meta;
  try {
    meta = await fetchImdbTitleMeta(imdbId);
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!meta.name) {
    return {
      status: "error",
      error: `IMDb title ${imdbId} not found`,
    };
  }

  const existing = await db
    .select({ onList: watchlistItems.onList })
    .from(watchlistItems)
    .where(eq(watchlistItems.imdbId, imdbId))
    .limit(1);
  const alreadyOnList = existing[0]?.onList === true;

  await db
    .insert(titles)
    .values({
      imdbId,
      name: meta.name,
      year: meta.year,
      titleType: meta.titleType,
      runtimeMinutes: meta.runtimeMinutes,
      seasonCount: meta.seasonCount,
      episodeCount: meta.episodeCount,
      plot: meta.plot,
      posterUrl: meta.posterUrl,
      imdbRating: meta.rating,
      imdbVotes: meta.votes,
      ratingFetchedAt: meta.rating != null ? now : null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: titles.imdbId,
      set: {
        name: meta.name,
        year: meta.year,
        titleType: meta.titleType,
        ...(meta.runtimeMinutes != null
          ? { runtimeMinutes: meta.runtimeMinutes }
          : {}),
        ...(meta.seasonCount != null ? { seasonCount: meta.seasonCount } : {}),
        ...(meta.episodeCount != null
          ? { episodeCount: meta.episodeCount }
          : {}),
        ...(meta.plot ? { plot: meta.plot } : {}),
        ...(meta.posterUrl ? { posterUrl: meta.posterUrl } : {}),
        ...(meta.rating != null
          ? {
              imdbRating: meta.rating,
              imdbVotes: meta.votes,
              ratingFetchedAt: now,
            }
          : {}),
        updatedAt: now,
      },
    });

  await db
    .insert(watchlistItems)
    .values({
      imdbId,
      onList: true,
      lastSeenAt: now,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: watchlistItems.imdbId,
      set: {
        onList: true,
        lastSeenAt: now,
        // Re-adding an off-list title: re-queue availability check
        ...(alreadyOnList ? {} : { availabilityCheckedAt: null }),
      },
    });

  return {
    status: "ok",
    imdbId,
    name: meta.name,
    alreadyOnList,
  };
}

/** Soft-remove: keep title/offer rows; hide from Available / Unavailable. */
export async function removeTitleFromWatchlist(
  imdbIdOrUrl: string,
): Promise<RemoveTitleResult> {
  const imdbId = normalizeImdbId(imdbIdOrUrl);
  if (!imdbId) {
    return { status: "error", error: "Invalid IMDb id" };
  }

  const db = getDb();
  const updated = await db
    .update(watchlistItems)
    .set({ onList: false })
    .where(eq(watchlistItems.imdbId, imdbId))
    .returning({ imdbId: watchlistItems.imdbId });

  if (updated.length === 0) {
    return { status: "error", error: "Title is not on your watchlist" };
  }

  return { status: "ok", imdbId };
}
