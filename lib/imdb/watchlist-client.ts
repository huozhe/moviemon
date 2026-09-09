export type WatchlistTitle = {
  imdbId: string; // tt...
  title: string;
  year?: number;
  type?: "movie" | "tv" | "other";
  /** IMDb aggregate rating from CSV export when present */
  imdbRating?: number;
  imdbVotes?: number;
  /** Runtime in minutes from CSV when present */
  runtimeMinutes?: number;
};

/**
 * Load the watchlist from a hosted IMDb CSV export.
 * IMDb serves AWS WAF challenges to server-side HTML fetches, so scraping the
 * watchlist page is not supported — export the CSV and host it.
 */
export async function fetchWatchlist(): Promise<WatchlistTitle[]> {
  const csvUrl = process.env.IMDB_WATCHLIST_CSV_URL?.trim();
  if (!csvUrl) {
    throw new Error(
      "Set IMDB_WATCHLIST_CSV_URL, or POST /api/sync with csvText. " +
        "IMDb blocks automated HTML fetches with AWS WAF.",
    );
  }
  return fetchWatchlistCsv(csvUrl);
}

/** Fetch + parse an IMDb-exported CSV (or any CSV with Const/Title columns). */
export async function fetchWatchlistCsv(url: string): Promise<WatchlistTitle[]> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "MovieMon/1.0 (+https://github.com/huozhe/moviemon)",
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
  const ratingIdx = header.findIndex(
    (h) =>
      h === "imdb rating" ||
      h === "imdbrating" ||
      h === "rating" ||
      h === "aggregate rating",
  );
  const votesIdx = header.findIndex(
    (h) =>
      h === "num votes" ||
      h === "numvotes" ||
      h === "votes" ||
      h === "vote count",
  );
  const runtimeIdx = header.findIndex(
    (h) =>
      h === "runtime (mins)" ||
      h === "runtime (min)" ||
      h === "runtime" ||
      h === "runtime minutes",
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

    let imdbRating: number | undefined;
    if (ratingIdx >= 0) {
      const raw = (cols[ratingIdx] ?? "").trim();
      if (raw) {
        const n = Number(raw);
        if (!Number.isNaN(n) && n >= 0 && n <= 10) imdbRating = n;
      }
    }

    let imdbVotes: number | undefined;
    if (votesIdx >= 0) {
      const raw = (cols[votesIdx] ?? "").trim().replace(/,/g, "");
      if (raw) {
        const n = Number(raw);
        if (!Number.isNaN(n) && n >= 0) imdbVotes = Math.round(n);
      }
    }

    let runtimeMinutes: number | undefined;
    if (runtimeIdx >= 0) {
      const raw = (cols[runtimeIdx] ?? "").trim().replace(/,/g, "");
      if (raw) {
        const n = Number(raw);
        if (!Number.isNaN(n) && n > 0) runtimeMinutes = Math.round(n);
      }
    }

    titles.push({
      imdbId,
      title,
      year,
      type: mapCsvTitleType(typeRaw),
      imdbRating,
      imdbVotes,
      runtimeMinutes,
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
