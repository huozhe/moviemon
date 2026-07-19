import type { ProviderId } from "./providers";

export type Offer = {
  providerId: ProviderId;
  monotype: "flatrate" | "free" | "ads" | "rent" | "buy";
  webUrl?: string;
};

export type GetUSOffersResult = {
  offers: Offer[];
  /** null when Watchmode has no title for this IMDb id */
  watchmodeId: number | null;
};

export class WatchmodeHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "WatchmodeHttpError";
    this.status = status;
  }
}

export function isRateLimited(err: unknown): boolean {
  return err instanceof WatchmodeHttpError && err.status === 429;
}

const REGION = "US";

/**
 * Resolve US streaming offers for an IMDb title via Watchmode.
 * Pass cachedWatchmodeId to skip the search call (halves API usage).
 */
export async function getUSOffers(
  imdbId: string,
  cachedWatchmodeId?: number | null,
): Promise<GetUSOffersResult> {
  const apiKey = process.env.WATCHMODE_API_KEY;
  if (!apiKey) {
    throw new Error("WATCHMODE_API_KEY is not set");
  }

  let titleId =
    typeof cachedWatchmodeId === "number" && cachedWatchmodeId > 0
      ? cachedWatchmodeId
      : null;

  if (titleId == null) {
    titleId = await searchWatchmodeId(apiKey, imdbId);
    if (titleId == null) {
      return { offers: [], watchmodeId: null };
    }
  }

  const sourcesUrl = new URL(
    `https://api.watchmode.com/v1/title/${titleId}/sources/`,
  );
  sourcesUrl.searchParams.set("apiKey", apiKey);
  sourcesUrl.searchParams.set("regions", REGION);

  const sourcesRes = await fetch(sourcesUrl.toString(), { cache: "no-store" });
  if (!sourcesRes.ok) {
    // Cached id may be stale — clear caller can drop cache on 404
    throw new WatchmodeHttpError(
      sourcesRes.status,
      `Watchmode sources failed for ${imdbId} (wm=${titleId}): HTTP ${sourcesRes.status}`,
    );
  }

  const sources = (await sourcesRes.json()) as Array<{
    source_id: number;
    name: string;
    type: string;
    web_url?: string;
    region?: string;
  }>;

  return {
    offers: mapWatchmodeSources(sources),
    watchmodeId: titleId,
  };
}

async function searchWatchmodeId(
  apiKey: string,
  imdbId: string,
): Promise<number | null> {
  const searchUrl = new URL("https://api.watchmode.com/v1/search/");
  searchUrl.searchParams.set("apiKey", apiKey);
  searchUrl.searchParams.set("search_field", "imdb_id");
  searchUrl.searchParams.set("search_value", imdbId);

  const searchRes = await fetch(searchUrl.toString(), { cache: "no-store" });
  if (!searchRes.ok) {
    throw new WatchmodeHttpError(
      searchRes.status,
      `Watchmode search failed for ${imdbId}: HTTP ${searchRes.status}`,
    );
  }

  const searchJson = (await searchRes.json()) as {
    title_results?: Array<{ id: number }>;
  };
  return searchJson.title_results?.[0]?.id ?? null;
}

/** Map raw Watchmode sources to our four providers. */
export function mapWatchmodeSources(
  sources: Array<{
    source_id: number;
    name: string;
    type: string;
    web_url?: string;
    region?: string;
  }>,
): Offer[] {
  const offers: Offer[] = [];
  const seen = new Set<string>();

  for (const s of sources) {
    if (s.region && s.region !== REGION) continue;
    const providerId = matchProvider(s.name);
    if (!providerId) continue;

    const monotype = mapMonotype(s.type);
    if (!monotype) continue;

    const key = `${providerId}:${monotype}`;
    if (seen.has(key)) continue;
    seen.add(key);

    offers.push({
      providerId,
      monotype,
      webUrl: s.web_url,
    });
  }

  return offers;
}

function matchProvider(name: string): ProviderId | null {
  const n = name.toLowerCase();
  if (n.includes("netflix")) return "netflix";
  if (n === "max" || n.includes("hbo max") || n.includes("max amazon")) {
    return "max";
  }
  if (n.includes("prime video") || n.includes("amazon prime")) return "prime";
  if (n.includes("youtube tv")) return "youtubetv";
  return null;
}

function mapMonotype(type: string): Offer["monotype"] | null {
  const t = type.toLowerCase();
  if (t === "sub" || t === "subscription" || t === "flatrate") return "flatrate";
  if (t === "free") return "free";
  if (t === "tve" || t === "ads" || t === "free with ads") return "ads";
  if (t === "rent") return "rent";
  if (t === "buy" || t === "purchase") return "buy";
  return null;
}
