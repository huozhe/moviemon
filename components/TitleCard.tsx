import Image from "next/image";
import { ProviderBadges } from "./ProviderBadges";
import { PlotExpand } from "./PlotExpand";

function typeLabel(titleType: string | null) {
  const t = (titleType ?? "").toLowerCase();
  if (t === "movie" || t.includes("movie") || t === "feature") return "Movie";
  if (t === "tv" || t.includes("series") || t.includes("tv")) return "TV";
  return titleType ? titleType : "Title";
}

function formatRating(rating: number | null | undefined) {
  if (rating == null || Number.isNaN(rating)) return null;
  return rating.toFixed(1);
}

function formatRuntime(minutes: number | null | undefined) {
  if (minutes == null || Number.isNaN(minutes) || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function TitleCard({
  imdbId,
  name,
  year,
  titleType,
  posterUrl,
  imdbRating,
  runtimeMinutes,
  plot,
  providerIds,
  webUrls,
  variant = "available",
}: {
  imdbId: string;
  name: string;
  year: number | null;
  titleType: string | null;
  posterUrl?: string | null;
  imdbRating?: number | null;
  runtimeMinutes?: number | null;
  plot?: string | null;
  providerIds: string[];
  webUrls?: Record<string, string | null>;
  variant?: "available" | "unavailable";
}) {
  const primaryHref =
    providerIds.length > 0
      ? (webUrls?.[providerIds[0]] ?? null)
      : null;
  const ratingText = formatRating(imdbRating ?? null);
  const runtimeText = formatRuntime(runtimeMinutes ?? null);

  return (
    <article className="group rounded-2xl bg-raised/80 p-3 ring-1 ring-border transition hover:bg-raised hover:ring-border-strong sm:p-4">
      <div className="flex gap-3 sm:gap-4">
        <div className="relative h-[88px] w-[60px] shrink-0 overflow-hidden rounded-lg bg-surface ring-1 ring-border sm:h-[104px] sm:w-[70px]">
          {posterUrl ? (
            <Image
              src={posterUrl}
              alt=""
              fill
              sizes="70px"
              className="object-cover"
              // Amazon CDN is cached by the browser; we only store the URL in DB.
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center bg-gradient-to-b from-surface to-void font-display text-lg font-bold text-faint"
              aria-hidden
            >
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-muted ring-1 ring-border">
                {typeLabel(titleType)}
              </span>
              {year != null ? (
                <span className="font-mono text-[11px] tabular-nums text-faint">
                  {year}
                </span>
              ) : null}
              {runtimeText ? (
                <span
                  className="font-mono text-[11px] tabular-nums text-faint"
                  title="Runtime"
                >
                  {runtimeText}
                </span>
              ) : null}
              {ratingText ? (
                <span
                  className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-accent ring-1 ring-accent/25"
                  title="IMDb rating (cached in DB)"
                >
                  <span aria-hidden className="text-[10px]">
                    ★
                  </span>
                  {ratingText}
                </span>
              ) : null}
            </div>

            <h2 className="font-display text-base font-semibold leading-snug tracking-tight text-ink sm:text-lg">
              {primaryHref ? (
                <a
                  href={primaryHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-accent"
                >
                  {name}
                </a>
              ) : (
                name
              )}
            </h2>

            <p className="mt-1">
              <a
                href={`https://www.imdb.com/title/${imdbId}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[11px] text-faint hover:text-muted"
              >
                IMDb {imdbId}
              </a>
            </p>

            {plot?.trim() ? <PlotExpand plot={plot} /> : null}
          </div>

          <div className="sm:max-w-[50%] sm:pt-0.5 sm:text-right">
            {variant === "unavailable" ? (
              <span className="inline-flex rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-faint ring-1 ring-border">
                Not on your services
              </span>
            ) : (
              <ProviderBadges providerIds={providerIds} webUrls={webUrls} />
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
