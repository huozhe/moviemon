import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  notInArray,
} from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  offers,
  providers,
  syncRuns,
  titles,
  watchlistItems,
} from "@/lib/db/schema";
import { AVAILABLE_MONOTYPES } from "@/lib/availability/providers";

export type TitleRow = {
  imdbId: string;
  name: string;
  year: number | null;
  titleType: string | null;
  posterUrl: string | null;
  imdbRating: number | null;
  imdbVotes: number | null;
  runtimeMinutes: number | null;
  seasonCount: number | null;
  episodeCount: number | null;
  plot: string | null;
  lastSeenAt: Date;
  providerIds: string[];
  webUrls: Record<string, string | null>;
  /** null = availability not checked yet */
  availabilityCheckedAt?: Date | null;
};

export type BrowserTitle = {
  imdbId: string;
  name: string;
  year: number | null;
  titleType: string | null;
  posterUrl: string | null;
  imdbRating: number | null;
  imdbVotes: number | null;
  runtimeMinutes: number | null;
  seasonCount: number | null;
  episodeCount: number | null;
  plot: string | null;
  lastSeenAt: string | null;
  providerIds: string[];
  webUrls: Record<string, string | null>;
};

/**
 * Titles on list with at least one subscription-ish offer on an enabled provider.
 */
export async function listAvailableTitles(): Promise<TitleRow[]> {
  const db = getDb();

  const rows = await db
    .select({
      imdbId: titles.imdbId,
      name: titles.name,
      year: titles.year,
      titleType: titles.titleType,
      posterUrl: titles.posterUrl,
      imdbRating: titles.imdbRating,
      imdbVotes: titles.imdbVotes,
      runtimeMinutes: titles.runtimeMinutes,
      seasonCount: titles.seasonCount,
      episodeCount: titles.episodeCount,
      plot: titles.plot,
      lastSeenAt: watchlistItems.lastSeenAt,
      availabilityCheckedAt: watchlistItems.availabilityCheckedAt,
      providerId: offers.providerId,
      webUrl: offers.webUrl,
    })
    .from(watchlistItems)
    .innerJoin(titles, eq(titles.imdbId, watchlistItems.imdbId))
    .innerJoin(offers, eq(offers.imdbId, titles.imdbId))
    .innerJoin(providers, eq(providers.id, offers.providerId))
    .where(
      and(
        eq(watchlistItems.onList, true),
        eq(providers.enabled, true),
        inArray(offers.monotype, [...AVAILABLE_MONOTYPES]),
      ),
    )
    .orderBy(asc(titles.name));

  return groupTitleRows(rows);
}

/**
 * On-list titles that were checked and have no qualifying offers.
 */
export async function listUnavailableTitles(): Promise<TitleRow[]> {
  const db = getDb();

  const available = await db
    .selectDistinct({ imdbId: offers.imdbId })
    .from(offers)
    .innerJoin(providers, eq(providers.id, offers.providerId))
    .where(
      and(
        eq(providers.enabled, true),
        inArray(offers.monotype, [...AVAILABLE_MONOTYPES]),
      ),
    );

  const availableIds = available.map((r) => r.imdbId);

  const base = db
    .select({
      imdbId: titles.imdbId,
      name: titles.name,
      year: titles.year,
      titleType: titles.titleType,
      posterUrl: titles.posterUrl,
      imdbRating: titles.imdbRating,
      imdbVotes: titles.imdbVotes,
      runtimeMinutes: titles.runtimeMinutes,
      seasonCount: titles.seasonCount,
      episodeCount: titles.episodeCount,
      plot: titles.plot,
      lastSeenAt: watchlistItems.lastSeenAt,
      availabilityCheckedAt: watchlistItems.availabilityCheckedAt,
    })
    .from(watchlistItems)
    .innerJoin(titles, eq(titles.imdbId, watchlistItems.imdbId));

  const checked = and(
    eq(watchlistItems.onList, true),
    isNotNull(watchlistItems.availabilityCheckedAt),
  );

  const rows =
    availableIds.length === 0
      ? await base.where(checked).orderBy(asc(titles.name))
      : await base
          .where(and(checked, notInArray(titles.imdbId, availableIds)))
          .orderBy(asc(titles.name));

  return rows.map((r) => ({
    ...r,
    providerIds: [],
    webUrls: {},
  }));
}

/** On-list titles not yet checked with Watchmode. */
export async function listPendingTitles(): Promise<TitleRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      imdbId: titles.imdbId,
      name: titles.name,
      year: titles.year,
      titleType: titles.titleType,
      posterUrl: titles.posterUrl,
      imdbRating: titles.imdbRating,
      imdbVotes: titles.imdbVotes,
      runtimeMinutes: titles.runtimeMinutes,
      seasonCount: titles.seasonCount,
      episodeCount: titles.episodeCount,
      plot: titles.plot,
      lastSeenAt: watchlistItems.lastSeenAt,
      availabilityCheckedAt: watchlistItems.availabilityCheckedAt,
    })
    .from(watchlistItems)
    .innerJoin(titles, eq(titles.imdbId, watchlistItems.imdbId))
    .where(
      and(
        eq(watchlistItems.onList, true),
        isNull(watchlistItems.availabilityCheckedAt),
      ),
    )
    .orderBy(asc(titles.name));

  return rows.map((r) => ({
    ...r,
    providerIds: [],
    webUrls: {},
  }));
}

export async function listProviders() {
  const db = getDb();
  return db.select().from(providers).orderBy(asc(providers.name));
}

export async function listRecentSyncRuns(limit = 10) {
  const db = getDb();
  return db
    .select()
    .from(syncRuns)
    .orderBy(desc(syncRuns.startedAt))
    .limit(limit);
}

export async function getListStats() {
  const db = getDb();

  const [onListRows, pendingRows, availableRows] = await Promise.all([
    db
      .select({ imdbId: watchlistItems.imdbId })
      .from(watchlistItems)
      .where(eq(watchlistItems.onList, true)),
    db
      .select({ imdbId: watchlistItems.imdbId })
      .from(watchlistItems)
      .where(
        and(
          eq(watchlistItems.onList, true),
          isNull(watchlistItems.availabilityCheckedAt),
        ),
      ),
    db
      .selectDistinct({ imdbId: offers.imdbId })
      .from(offers)
      .innerJoin(providers, eq(providers.id, offers.providerId))
      .innerJoin(watchlistItems, eq(watchlistItems.imdbId, offers.imdbId))
      .where(
        and(
          eq(watchlistItems.onList, true),
          eq(providers.enabled, true),
          inArray(offers.monotype, [...AVAILABLE_MONOTYPES]),
        ),
      ),
  ]);

  const onList = onListRows.length;
  const pending = pendingRows.length;
  const available = availableRows.length;
  const unavailable = Math.max(0, onList - pending - available);

  return { available, unavailable, pending, onList };
}

/** Serialize TitleRow for client components. */
export function toBrowserTitles(rows: TitleRow[]): BrowserTitle[] {
  return rows.map((t) => ({
    imdbId: t.imdbId,
    name: t.name,
    year: t.year,
    titleType: t.titleType,
    posterUrl: t.posterUrl,
    imdbRating: t.imdbRating,
    imdbVotes: t.imdbVotes,
    runtimeMinutes: t.runtimeMinutes,
    seasonCount: t.seasonCount,
    episodeCount: t.episodeCount,
    plot: t.plot,
    lastSeenAt:
      t.lastSeenAt instanceof Date
        ? t.lastSeenAt.toISOString()
        : t.lastSeenAt
          ? String(t.lastSeenAt)
          : null,
    providerIds: t.providerIds,
    webUrls: t.webUrls,
  }));
}

function groupTitleRows(
  rows: Array<{
    imdbId: string;
    name: string;
    year: number | null;
    titleType: string | null;
    posterUrl: string | null;
    imdbRating: number | null;
    imdbVotes: number | null;
    runtimeMinutes: number | null;
    seasonCount: number | null;
    episodeCount: number | null;
    plot: string | null;
    lastSeenAt: Date;
    availabilityCheckedAt?: Date | null;
    providerId: string;
    webUrl: string | null;
  }>,
): TitleRow[] {
  const map = new Map<string, TitleRow>();
  for (const r of rows) {
    let row = map.get(r.imdbId);
    if (!row) {
      row = {
        imdbId: r.imdbId,
        name: r.name,
        year: r.year,
        titleType: r.titleType,
        posterUrl: r.posterUrl,
        imdbRating: r.imdbRating,
        imdbVotes: r.imdbVotes,
        runtimeMinutes: r.runtimeMinutes,
        seasonCount: r.seasonCount,
        episodeCount: r.episodeCount,
        plot: r.plot,
        lastSeenAt: r.lastSeenAt,
        availabilityCheckedAt: r.availabilityCheckedAt,
        providerIds: [],
        webUrls: {},
      };
      map.set(r.imdbId, row);
    }
    if (!row.providerIds.includes(r.providerId)) {
      row.providerIds.push(r.providerId);
      row.webUrls[r.providerId] = r.webUrl;
    }
  }
  return [...map.values()];
}
