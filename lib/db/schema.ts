import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  bigserial,
} from "drizzle-orm/pg-core";

export const titles = pgTable("titles", {
  imdbId: text("imdb_id").primaryKey(),
  name: text("name").notNull(),
  year: integer("year"),
  titleType: text("title_type"), // movie | tv | other
  posterUrl: text("poster_url"),
  /** Cached Watchmode title id — skips /search on later availability passes */
  watchmodeId: integer("watchmode_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const watchlistItems = pgTable("watchlist_items", {
  imdbId: text("imdb_id")
    .primaryKey()
    .references(() => titles.imdbId),
  onList: boolean("on_list").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  /** Set after a successful Watchmode sources lookup (even if zero offers). */
  availabilityCheckedAt: timestamp("availability_checked_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const providers = pgTable("providers", {
  id: text("id").primaryKey(), // netflix | max | prime | youtubetv
  name: text("name").notNull(),
  externalId: text("external_id"),
  enabled: boolean("enabled").notNull().default(true),
});

export const offers = pgTable(
  "offers",
  {
    imdbId: text("imdb_id")
      .notNull()
      .references(() => titles.imdbId),
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id),
    monotype: text("monotype").notNull(), // flatrate | free | ads | rent | buy
    webUrl: text("web_url"),
    lastCheckedAt: timestamp("last_checked_at", {
      withTimezone: true,
    }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.imdbId, t.providerId, t.monotype] })],
);

export const syncRuns = pgTable("sync_runs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  kind: text("kind").notNull(), // watchlist | availability
  status: text("status").notNull(), // ok | error
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  stats: jsonb("stats"),
  error: text("error"),
});
