/**
 * IMDb metadata via public GraphQL (no API key).
 * Ratings/runtime prefer CSV on import; GraphQL gap-fills missing fields.
 * Posters: store CDN URL in titles.poster_url (browser/CDN cache the bytes).
 */

export type ImdbRating = {
  rating: number;
  votes: number;
};

export type ImdbTitleMeta = {
  /** Primary title text from GraphQL (null if title not found). */
  name: string | null;
  year: number | null;
  /** Normalized: movie | tv | other */
  titleType: string | null;
  rating: number | null;
  votes: number | null;
  posterUrl: string | null;
  runtimeMinutes: number | null;
  plot: string | null;
  seasonCount: number | null;
  episodeCount: number | null;
};

const GQL_URL = "https://graphql.imdb.com/";

async function imdbGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (compatible; MovieMon/1.0; +https://github.com/huozhe/moviemon)",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`IMDb GraphQL failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(`IMDb GraphQL error: ${json.errors[0].message}`);
  }

  if (!json.data) {
    throw new Error("IMDb GraphQL returned no data");
  }

  return json.data;
}

/** Rating only (legacy helper). */
export async function fetchImdbRating(
  imdbId: string,
): Promise<ImdbRating | null> {
  const meta = await fetchImdbTitleMeta(imdbId);
  if (meta.rating == null) return null;
  return { rating: meta.rating, votes: meta.votes ?? 0 };
}

/**
 * Title identity + rating + poster + runtime + plot + series counts.
 * Poster URLs point at Amazon CDN; we store the URL only.
 */
export async function fetchImdbTitleMeta(
  imdbId: string,
): Promise<ImdbTitleMeta> {
  const data = await imdbGraphql<{
    title?: {
      titleText?: { text?: string | null } | null;
      releaseYear?: { year?: number | null } | null;
      titleType?: { id?: string | null; text?: string | null } | null;
      ratingsSummary?: {
        aggregateRating?: number | null;
        voteCount?: number | null;
      } | null;
      primaryImage?: {
        url?: string | null;
      } | null;
      runtime?: {
        seconds?: number | null;
      } | null;
      plot?: {
        plotText?: {
          plainText?: string | null;
        } | null;
      } | null;
      episodes?: {
        seasons?: Array<{ number?: number | null }> | null;
        episodes?: {
          total?: number | null;
        } | null;
      } | null;
    } | null;
  }>(
    `query TitleMeta($id: ID!) {
      title(id: $id) {
        titleText {
          text
        }
        releaseYear {
          year
        }
        titleType {
          id
          text
        }
        ratingsSummary {
          aggregateRating
          voteCount
        }
        primaryImage {
          url
        }
        runtime {
          seconds
        }
        plot {
          plotText {
            plainText
          }
        }
        episodes {
          seasons {
            number
          }
          episodes(first: 1) {
            total
          }
        }
      }
    }`,
    { id: imdbId },
  );

  const t = data.title;
  const name = t?.titleText?.text?.trim() || null;
  const year =
    typeof t?.releaseYear?.year === "number" ? t.releaseYear.year : null;
  const titleType = mapGraphqlTitleType(
    t?.titleType?.id ?? t?.titleType?.text ?? null,
  );

  const summary = t?.ratingsSummary;
  const rating =
    typeof summary?.aggregateRating === "number" &&
    !Number.isNaN(summary.aggregateRating)
      ? summary.aggregateRating
      : null;
  const votes =
    typeof summary?.voteCount === "number" ? summary.voteCount : null;

  let posterUrl = t?.primaryImage?.url?.trim() || null;
  if (posterUrl && posterUrl.includes("media-amazon.com")) {
    posterUrl = posterUrl.replace(
      /\._V1_.*(?=\.(jpg|jpeg|png|webp))/i,
      "._V1_UX300_CR0,0,300,444_",
    );
  }

  const seconds = t?.runtime?.seconds;
  const runtimeMinutes =
    typeof seconds === "number" && seconds > 0
      ? Math.round(seconds / 60)
      : null;

  const plotRaw = t?.plot?.plotText?.plainText?.trim() || null;
  const plot = plotRaw && plotRaw.length > 0 ? plotRaw : null;

  const seasons = t?.episodes?.seasons;
  const seasonCount =
    Array.isArray(seasons) && seasons.length > 0 ? seasons.length : null;
  const epTotal = t?.episodes?.episodes?.total;
  const episodeCount =
    typeof epTotal === "number" && epTotal > 0 ? epTotal : null;

  return {
    name,
    year,
    titleType,
    rating,
    votes,
    posterUrl,
    runtimeMinutes,
    plot,
    seasonCount,
    episodeCount,
  };
}

function mapGraphqlTitleType(raw: string | null): string | null {
  if (!raw) return null;
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
