export type WatchlistTitle = {
  imdbId: string; // tt...
  title: string;
  year?: number;
  type?: "movie" | "tv" | "other";
};

const IMDB_ID_RE = /tt\d{7,}/g;

/**
 * Fetch a public IMDb watchlist page and extract titles.
 * Hard rule for callers: on failure, do not wipe existing on_list rows.
 *
 * Implementation is a minimal parser; prefer embedded data when available.
 * Run on Node runtime (not Edge).
 */
export async function fetchPublicWatchlist(
  url: string,
): Promise<WatchlistTitle[]> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
    // Always hit live page during sync
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`IMDb watchlist fetch failed: HTTP ${res.status}`);
  }

  const html = await res.text();
  return parseWatchlistHtml(html);
}

/** Exported for unit testing. */
export function parseWatchlistHtml(html: string): WatchlistTitle[] {
  // Prefer IMDb's embedded JSON when present
  const fromEmbedded = parseEmbeddedWatchlist(html);
  if (fromEmbedded.length > 0) {
    return fromEmbedded;
  }

  // Fallback: collect unique tt ids from the page (order preserved)
  const seen = new Set<string>();
  const titles: WatchlistTitle[] = [];
  for (const match of html.matchAll(IMDB_ID_RE)) {
    const imdbId = match[0];
    if (seen.has(imdbId)) continue;
    seen.add(imdbId);
    titles.push({ imdbId, title: imdbId, type: "other" });
  }

  if (titles.length === 0) {
    throw new Error("IMDb watchlist parse produced zero titles");
  }

  return titles;
}

function parseEmbeddedWatchlist(html: string): WatchlistTitle[] {
  // Common IMDb pattern: __NEXT_DATA__ script with page props
  const nextDataMatch = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!nextDataMatch?.[1]) return [];

  try {
    const data = JSON.parse(nextDataMatch[1]) as unknown;
    const found: WatchlistTitle[] = [];
    const seen = new Set<string>();
    walk(data, seen, found);
    return found;
  } catch {
    return [];
  }
}

function walk(
  node: unknown,
  seen: Set<string>,
  out: WatchlistTitle[],
): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, seen, out);
    return;
  }
  if (typeof node !== "object") return;

  const obj = node as Record<string, unknown>;
  const id =
    (typeof obj.const === "string" && obj.const) ||
    (typeof obj.id === "string" && obj.id) ||
    (typeof obj.tconst === "string" && obj.tconst) ||
    null;

  if (id && /^tt\d{7,}$/.test(id) && !seen.has(id)) {
    const titleText =
      (typeof obj.titleText === "object" &&
        obj.titleText &&
        typeof (obj.titleText as { text?: string }).text === "string" &&
        (obj.titleText as { text: string }).text) ||
      (typeof obj.originalTitleText === "object" &&
        obj.originalTitleText &&
        typeof (obj.originalTitleText as { text?: string }).text === "string" &&
        (obj.originalTitleText as { text: string }).text) ||
      (typeof obj.title === "string" && obj.title) ||
      (typeof obj.primaryTitle === "string" && obj.primaryTitle) ||
      id;

    let year: number | undefined;
    if (typeof obj.releaseYear === "number") year = obj.releaseYear;
    else if (
      typeof obj.releaseYear === "object" &&
      obj.releaseYear &&
      typeof (obj.releaseYear as { year?: number }).year === "number"
    ) {
      year = (obj.releaseYear as { year: number }).year;
    } else if (typeof obj.year === "number") {
      year = obj.year;
    }

    const typeRaw =
      (typeof obj.titleType === "object" &&
        obj.titleType &&
        typeof (obj.titleType as { id?: string }).id === "string" &&
        (obj.titleType as { id: string }).id) ||
      (typeof obj.titleType === "string" && obj.titleType) ||
      "";

    const type = mapTitleType(typeRaw);

    seen.add(id);
    out.push({ imdbId: id, title: titleText, year, type });
  }

  for (const value of Object.values(obj)) {
    walk(value, seen, out);
  }
}

function mapTitleType(raw: string): WatchlistTitle["type"] {
  const s = raw.toLowerCase();
  if (s.includes("movie") || s === "feature") return "movie";
  if (s.includes("series") || s.includes("tv") || s.includes("episode")) {
    return "tv";
  }
  return "other";
}
