import { and, asc, desc, eq, inArray, notInArray } from "drizzle-orm";
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
  lastSeenAt: Date;
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
      lastSeenAt: watchlistItems.lastSeenAt,
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
 * On-list titles with no qualifying offers.
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
      lastSeenAt: watchlistItems.lastSeenAt,
    })
    .from(watchlistItems)
    .innerJoin(titles, eq(titles.imdbId, watchlistItems.imdbId));

  const rows =
    availableIds.length === 0
      ? await base
          .where(eq(watchlistItems.onList, true))
          .orderBy(asc(titles.name))
      : await base
          .where(
            and(
              eq(watchlistItems.onList, true),
              notInArray(titles.imdbId, availableIds),
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

function groupTitleRows(
  rows: Array<{
    imdbId: string;
    name: string;
    year: number | null;
    titleType: string | null;
    posterUrl: string | null;
    lastSeenAt: Date;
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
        lastSeenAt: r.lastSeenAt,
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
