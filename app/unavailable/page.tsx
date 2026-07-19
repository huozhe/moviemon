import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { PageHeader } from "@/components/PageHeader";
import { TitleBrowser } from "@/components/TitleBrowser";
import {
  getListStats,
  listPendingTitles,
  listUnavailableTitles,
  toBrowserTitles,
} from "@/lib/titles/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unavailable",
};

export default async function UnavailablePage() {
  let unavailable: Awaited<ReturnType<typeof listUnavailableTitles>> = [];
  let pending: Awaited<ReturnType<typeof listPendingTitles>> = [];
  let stats = { available: 0, unavailable: 0, pending: 0, onList: 0 };
  let error: string | null = null;

  if (!process.env.DATABASE_URL) {
    error = "DATABASE_URL is not set.";
  } else {
    try {
      [unavailable, pending, stats] = await Promise.all([
        listUnavailableTitles(),
        listPendingTitles(),
        getListStats(),
      ]);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <>
      <SiteNav
        current="/unavailable"
        counts={{
          available: stats.available,
          unavailable: stats.unavailable,
          pending: stats.pending,
        }}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-16">
        <PageHeader
          eyebrow="Still on the list"
          title="Unavailable"
          description="On your MovieMon watchlist, checked, but no subscription-style offer on your enabled services. Rent/buy-only does not count."
          count={unavailable.length}
          countLabel="waiting"
        />

        {error ? (
          <div
            role="alert"
            className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger ring-1 ring-danger/30"
          >
            {error}
          </div>
        ) : (
          <>
            {pending.length > 0 ? (
              <div className="mb-4 rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent ring-1 ring-accent/25">
                <strong className="font-semibold">{pending.length}</strong> title
                {pending.length === 1 ? "" : "s"} still pending a Watchmode
                check — they appear here after the next successful sync.
              </div>
            ) : null}
            <TitleBrowser
              titles={toBrowserTitles(unavailable)}
              emptyMessage={
                pending.length > 0
                  ? "No checked-unavailable titles yet. Finish availability catch-up first."
                  : "Every checked title is available on at least one of your services — nice."
              }
              variant="unavailable"
              enableProviderFilter={false}
            />
          </>
        )}
      </main>
    </>
  );
}
