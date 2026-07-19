import { TitleCard } from "./TitleCard";
import type { TitleRow } from "@/lib/titles/queries";

export function TitleList({
  titles,
  emptyMessage,
}: {
  titles: TitleRow[];
  emptyMessage: string;
}) {
  if (titles.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-500">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {titles.map((t) => (
        <li key={t.imdbId}>
          <TitleCard
            imdbId={t.imdbId}
            name={t.name}
            year={t.year}
            titleType={t.titleType}
            providerIds={t.providerIds}
            webUrls={t.webUrls}
          />
        </li>
      ))}
    </ul>
  );
}
