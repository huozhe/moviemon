import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { PageHeader } from "@/components/PageHeader";
import { TitleBrowser } from "@/components/TitleBrowser";
import {
  getListStats,
  listAvailableTitles,
  toBrowserTitles,
} from "@/lib/titles/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Available",
};

export default async function HomePage() {
  let titles: Awaited<ReturnType<typeof listAvailableTitles>> = [];
  let stats = { available: 0, unavailable: 0, pending: 0, onList: 0 };
  let error: string | null = null;

  if (!process.env.DATABASE_URL) {
    error =
      "Database is not connected. Add DATABASE_URL (Neon on Vercel), then run migrations and seed.";
  } else {
    try {
      [titles, stats] = await Promise.all([
        listAvailableTitles(),
        getListStats(),
      ]);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <>
      <SiteNav
        current="/"
        counts={{
          available: stats.available,
          unavailable: stats.unavailable,
          pending: stats.pending,
        }}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-16">
        <PageHeader
          eyebrow="Ready to watch"
          title="Available now"
          description="On your IMDb watchlist and streamable on Max, Netflix, Prime, or YouTube TV (US subscription / free / ads)."
          count={titles.length}
          countLabel="ready"
        />

        {error ? (
          <div
            role="alert"
            className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger ring-1 ring-danger/30"
          >
            {error}
          </div>
        ) : (
          <TitleBrowser
            titles={toBrowserTitles(titles)}
            emptyMessage="Nothing available yet. Import your watchlist and run an availability sync — new titles show up here when they land on your services."
            variant="available"
            enableProviderFilter
          />
        )}
      </main>
    </>
  );
}
