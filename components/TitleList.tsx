import { TitleCard } from "./TitleCard";
import type { TitleRow } from "@/lib/titles/queries";

/** Simple non-interactive list (settings, etc.). Prefer TitleBrowser for main lists. */
export function TitleList({
  titles,
  emptyMessage,
  variant = "available",
}: {
  titles: TitleRow[];
  emptyMessage: string;
  variant?: "available" | "unavailable";
}) {
  if (titles.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border-strong bg-raised/40 px-5 py-12 text-center">
        <p className="text-sm text-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {titles.map((t) => (
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
  );
}
