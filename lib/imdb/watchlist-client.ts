export type WatchlistTitle = {
  imdbId: string; // tt...
  title: string;
  year?: number;
  type?: "movie" | "tv" | "other";
};

const IMDB_ID_RE = /tt\d{7,}/g;

/**
 * Load the watchlist from env-configured sources.
 * Prefers CSV (works server-side). HTML is attempted only as a fallback and
 * usually fails because IMDb serves AWS WAF challenges (HTTP 202) to bots.
 */
export async function fetchWatchlist(): Promise<WatchlistTitle[]> {
  const csvUrl = process.env.IMDB_WATCHLIST_CSV_URL?.trim();
  if (csvUrl) {
    return fetchWatchlistCsv(csvUrl);
  }

  const pageUrl = process.env.IMDB_WATCHLIST_URL?.trim();
  if (pageUrl) {
    return fetchPublicWatchlist(pageUrl);
  }

  throw new Error(
    "Set IMDB_WATCHLIST_CSV_URL (recommended) or IMDB_WATCHLIST_URL. " +
      "IMDb blocks automated HTML fetches with AWS WAF; use a CSV export URL.",
  );
}

/** Fetch + parse an IMDb-exported CSV (or any CSV with Const/Title columns). */
export async function fetchWatchlistCsv(url: string): Promise<WatchlistTitle[]> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/csv,text/plain,*/*",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Watchlist CSV fetch failed: HTTP ${res.status}`);
  }

  const text = await res.text();
  if (looksLikeWafChallenge(res, text)) {
    throw new Error(
      "Watchlist CSV URL was blocked by AWS WAF. Host the CSV somewhere public (GitHub Gist raw URL, S3, etc.).",
    );
  }

  return parseWatchlistCsv(text);
}

/**
 * Fetch a public IMDb watchlist page and extract titles.
 * Hard rule for callers: on failure, do not wipe existing on_list rows.
 * Run on Node runtime (not Edge).
 */
export async function fetchPublicWatchlist(
  url: string,
): Promise<WatchlistTitle[]> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    cache: "no-store",
    redirect: "follow",
  });

  const html = await res.text();

  if (looksLikeWafChallenge(res, html)) {
    throw new Error(
      "IMDb blocked the watchlist HTML fetch with AWS WAF (HTTP 202 challenge). " +
        "Server-side scrapes no longer work. Export your watchlist as CSV from IMDb " +
        "(⋯ → Export), host the file (e.g. GitHub Gist raw URL), and set IMDB_WATCHLIST_CSV_URL.",
    );
  }

  if (!res.ok) {
    throw new Error(`IMDb watchlist fetch failed: HTTP ${res.status}`);
  }

  return parseWatchlistHtml(html);
}

function looksLikeWafChallenge(res: Response, body: string): boolean {
  if (res.status === 202) return true;
  if (res.headers.get("x-amzn-waf-action") === "challenge") return true;
  if (/awsWafCookieDomainList|gokuProps|x-amzn-waf-action/i.test(body)) {
    return true;
  }
  return false;
}

/** Parse IMDb export CSV. Column "Const" is the imdb id (tt…). */
export function parseWatchlistCsv(csv: string): WatchlistTitle[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    throw new Error("Watchlist CSV is empty or missing a header row");
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const constIdx = header.findIndex(
    (h) => h === "const" || h === "imdb id" || h === "imdbid" || h === "tconst",
  );
  const titleIdx = header.findIndex(
    (h) => h === "title" || h === "name" || h === "titletext",
  );
  const yearIdx = header.findIndex((h) => h === "year" || h === "release year");
  const typeIdx = header.findIndex(
    (h) => h === "title type" || h === "titletype" || h === "type",
  );

  if (constIdx === -1) {
    throw new Error(
      'Watchlist CSV missing an IMDb id column (expected "Const" from IMDb export)',
    );
  }

  const titles: WatchlistTitle[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const imdbId = (cols[constIdx] ?? "").trim();
    if (!/^tt\d{7,}$/.test(imdbId) || seen.has(imdbId)) continue;
    seen.add(imdbId);

    const title =
      (titleIdx >= 0 ? cols[titleIdx]?.trim() : undefined) || imdbId;
    const yearRaw = yearIdx >= 0 ? cols[yearIdx]?.trim() : undefined;
    const year = yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : undefined;
    const typeRaw = typeIdx >= 0 ? cols[typeIdx]?.trim() ?? "" : "";

    titles.push({
      imdbId,
      title,
      year,
      type: mapCsvTitleType(typeRaw),
    });
  }

  if (titles.length === 0) {
    throw new Error("Watchlist CSV parse produced zero titles");
  }

  return titles;
}

/** Minimal CSV line parser (handles quoted fields). */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function mapCsvTitleType(raw: string): WatchlistTitle["type"] {
  const s = raw.toLowerCase();
  if (s.includes("movie") || s === "feature" || s === "video" || s === "short") {
    return "movie";
  }
  if (
    s.includes("series") ||
    s.includes("tv") ||
    s.includes("episode") ||
    s.includes("mini")
  ) {
    return "tv";
  }
  return "other";
}

/** Exported for unit testing. */
export function parseWatchlistHtml(html: string): WatchlistTitle[] {
  if (looksLikeWafHtml(html)) {
    throw new Error(
      "IMDb returned an AWS WAF challenge page instead of the watchlist HTML.",
    );
  }

  const fromEmbedded = parseEmbeddedWatchlist(html);
  if (fromEmbedded.length > 0) {
    return fromEmbedded;
  }

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

function looksLikeWafHtml(html: string): boolean {
  return /awsWafCookieDomainList|gokuProps/i.test(html);
}

function parseEmbeddedWatchlist(html: string): WatchlistTitle[] {
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

    seen.add(id);
    out.push({ imdbId: id, title: titleText, year, type: mapCsvTitleType(typeRaw) });
  }

  for (const value of Object.values(obj)) {
    walk(value, seen, out);
  }
}
