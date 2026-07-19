import { ProviderBadges } from "./ProviderBadges";

export function TitleCard({
  imdbId,
  name,
  year,
  titleType,
  providerIds,
  webUrls,
}: {
  imdbId: string;
  name: string;
  year: number | null;
  titleType: string | null;
  providerIds: string[];
  webUrls?: Record<string, string | null>;
}) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">
            {name}
            {year != null ? (
              <span className="ml-1.5 font-normal text-zinc-500">({year})</span>
            ) : null}
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {titleType ?? "title"} ·{" "}
            <a
              href={`https://www.imdb.com/title/${imdbId}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:underline"
            >
              {imdbId}
            </a>
          </p>
        </div>
        <ProviderBadges providerIds={providerIds} webUrls={webUrls} />
      </div>
    </article>
  );
}
