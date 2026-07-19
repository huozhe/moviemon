/**
 * Fetch IMDb aggregate rating via the public GraphQL endpoint (no API key).
 * Gap-fill only — prefer CSV "IMDb Rating" on watchlist import.
 */

export type ImdbRating = {
  rating: number;
  votes: number;
};

const GQL_URL = "https://graphql.imdb.com/";

export async function fetchImdbRating(
  imdbId: string,
): Promise<ImdbRating | null> {
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (compatible; MovieMon/1.0; +https://github.com/huozhe/moviemon)",
    },
    body: JSON.stringify({
      query: `query TitleRating($id: ID!) {
        title(id: $id) {
          ratingsSummary {
            aggregateRating
            voteCount
          }
        }
      }`,
      variables: { id: imdbId },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `IMDb GraphQL rating failed for ${imdbId}: HTTP ${res.status}`,
    );
  }

  const json = (await res.json()) as {
    data?: {
      title?: {
        ratingsSummary?: {
          aggregateRating?: number | null;
          voteCount?: number | null;
        } | null;
      } | null;
    };
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(
      `IMDb GraphQL rating error for ${imdbId}: ${json.errors[0].message}`,
    );
  }

  const summary = json.data?.title?.ratingsSummary;
  const rating = summary?.aggregateRating;
  if (typeof rating !== "number" || Number.isNaN(rating)) {
    return null;
  }

  return {
    rating,
    votes: typeof summary?.voteCount === "number" ? summary.voteCount : 0,
  };
}
