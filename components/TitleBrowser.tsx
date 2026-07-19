"use client";

import { useMemo, useState } from "react";
import { TitleCard } from "./TitleCard";
import { PROVIDER_LABELS } from "./ProviderBadges";
import type { BrowserTitle } from "@/lib/titles/queries";

export type { BrowserTitle };

const PROVIDER_FILTERS = ["netflix", "max", "prime", "youtubetv"] as const;
const TYPE_FILTERS = [
  { id: "all", label: "All" },
  { id: "movie", label: "Movies" },
  { id: "tv", label: "TV" },
] as const;

export type SortKey = "title" | "year" | "rating";

const SORT_OPTIONS: Array<{ id: SortKey; label: string }> = [
  { id: "title", label: "Title" },
  { id: "year", label: "Year" },
  { id: "rating", label: "IMDb ★" },
];

function matchesType(titleType: string | null, filter: string) {
  if (filter === "all") return true;
  const t = (titleType ?? "").toLowerCase();
  if (filter === "movie") {
    return t === "movie" || t.includes("movie") || t === "feature";
  }
  if (filter === "tv") {
    return t === "tv" || t.includes("series") || t.includes("tv");
  }
  return true;
}

function sortTitles(list: BrowserTitle[], sort: SortKey): BrowserTitle[] {
  const copy = [...list];
  copy.sort((a, b) => {
    if (sort === "title") {
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    }
    if (sort === "year") {
      const ay = a.year ?? -1;
      const by = b.year ?? -1;
      if (by !== ay) return by - ay; // newest first
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    }
    // rating — highest first; nulls last
    const ar = a.imdbRating;
    const br = b.imdbRating;
    if (ar == null && br == null) {
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    }
    if (ar == null) return 1;
    if (br == null) return -1;
    if (br !== ar) return br - ar;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return copy;
}

export function TitleBrowser({
  titles,
  emptyMessage,
  variant = "available",
  enableProviderFilter = true,
  defaultSort = "title",
}: {
  titles: BrowserTitle[];
  emptyMessage: string;
  variant?: "available" | "unavailable";
  enableProviderFilter?: boolean;
  defaultSort?: SortKey;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>(defaultSort);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = titles.filter((t) => {
      if (!matchesType(t.titleType, typeFilter)) return false;
      if (providerFilter && !t.providerIds.includes(providerFilter)) {
        return false;
      }
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.imdbId.toLowerCase().includes(q) ||
        String(t.year ?? "").includes(q) ||
        (t.imdbRating != null && String(t.imdbRating).includes(q))
      );
    });
    return sortTitles(list, sort);
  }, [titles, query, typeFilter, providerFilter, sort]);

  if (titles.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border-strong bg-raised/40 px-5 py-12 text-center">
        <p className="font-display text-base font-semibold text-ink">
          Nothing here yet
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-[3.25rem] z-30 -mx-4 space-y-3 border-b border-border/70 bg-void/90 px-4 py-3 backdrop-blur-md sm:top-[3.5rem]">
        <label className="block">
          <span className="sr-only">Search titles</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, year, or IMDb id…"
            className="w-full rounded-xl border-0 bg-raised px-3.5 py-2.5 text-sm text-ink ring-1 ring-border placeholder:text-faint focus:ring-2 focus:ring-accent"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex flex-wrap gap-1"
            role="group"
            aria-label="Title type"
          >
            {TYPE_FILTERS.map((f) => {
              const active = typeFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTypeFilter(f.id)}
                  className={
                    active
                      ? "rounded-lg bg-ink px-2.5 py-1 text-xs font-semibold text-void"
                      : "rounded-lg bg-raised px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-border hover:text-ink"
                  }
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <div
            className="flex flex-wrap gap-1"
            role="group"
            aria-label="Sort by"
          >
            {SORT_OPTIONS.map((s) => {
              const active = sort === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSort(s.id)}
                  className={
                    active
                      ? "rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-void"
                      : "rounded-lg bg-raised px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-border hover:text-ink"
                  }
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          {enableProviderFilter ? (
            <div
              className="flex flex-wrap gap-1"
              role="group"
              aria-label="Provider"
            >
              <button
                type="button"
                onClick={() => setProviderFilter(null)}
                className={
                  providerFilter === null
                    ? "rounded-lg bg-ink/90 px-2.5 py-1 text-xs font-semibold text-void"
                    : "rounded-lg bg-raised px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-border hover:text-ink"
                }
              >
                Any service
              </button>
              {PROVIDER_FILTERS.map((id) => {
                const active = providerFilter === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      setProviderFilter((cur) => (cur === id ? null : id))
                    }
                    className={
                      active
                        ? "rounded-lg bg-ink/90 px-2.5 py-1 text-xs font-semibold text-void"
                        : "rounded-lg bg-raised px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-border hover:text-ink"
                    }
                  >
                    {PROVIDER_LABELS[id]}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <p className="text-xs text-faint">
          Showing{" "}
          <span className="tabular-nums text-muted">{filtered.length}</span> of{" "}
          <span className="tabular-nums text-muted">{titles.length}</span>
          {sort === "rating" ? " · highest rating first" : null}
          {sort === "year" ? " · newest year first" : null}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted">
          No titles match these filters.{" "}
          <button
            type="button"
            className="font-medium text-accent hover:underline"
            onClick={() => {
              setQuery("");
              setTypeFilter("all");
              setProviderFilter(null);
              setSort(defaultSort);
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {filtered.map((t) => (
            <li key={t.imdbId}>
              <TitleCard
                imdbId={t.imdbId}
                name={t.name}
                year={t.year}
                titleType={t.titleType}
                imdbRating={t.imdbRating}
                providerIds={t.providerIds}
                webUrls={t.webUrls}
                variant={variant}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
