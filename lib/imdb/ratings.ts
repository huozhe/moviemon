/**
 * IMDb metadata via public GraphQL (no API key).
 * - Ratings: prefer CSV on import; GraphQL gap-fills missing scores.
 * - Posters: store CDN URL in titles.poster_url (browser/CDN cache the bytes).
 */

export type ImdbRating = {
  rating: number;
  votes: number;
};

export type ImdbTitleMeta = {
  rating: number | null;
  votes: number | null;
  posterUrl: string | null;
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
 * Rating + primary poster URL in one request.
 * Poster URLs point at Amazon CDN (m.media-amazon.com); we store the URL only.
 */
export async function fetchImdbTitleMeta(
  imdbId: string,
): Promise<ImdbTitleMeta> {
  const data = await imdbGraphql<{
    title?: {
      ratingsSummary?: {
        aggregateRating?: number | null;
        voteCount?: number | null;
      } | null;
      primaryImage?: {
        url?: string | null;
      } | null;
    } | null;
  }>(
    `query TitleMeta($id: ID!) {
      title(id: $id) {
        ratingsSummary {
          aggregateRating
          voteCount
        }
        primaryImage {
          url
        }
      }
    }`,
    { id: imdbId },
  );

  const summary = data.title?.ratingsSummary;
  const rating =
    typeof summary?.aggregateRating === "number" &&
    !Number.isNaN(summary.aggregateRating)
      ? summary.aggregateRating
      : null;
  const votes =
    typeof summary?.voteCount === "number" ? summary.voteCount : null;

  let posterUrl = data.title?.primaryImage?.url?.trim() || null;
  // Prefer a modest width for list UI (Amazon CDN supports UX size params)
  if (posterUrl && posterUrl.includes("media-amazon.com")) {
    posterUrl = posterUrl.replace(
      /\._V1_.*(?=\.(jpg|jpeg|png|webp))/i,
      "._V1_UX300_CR0,0,300,444_",
    );
  }

  return { rating, votes, posterUrl };
}
