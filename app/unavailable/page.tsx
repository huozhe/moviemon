import { SiteNav } from "@/components/SiteNav";
import { TitleList } from "@/components/TitleList";
import {
  listPendingTitles,
  listUnavailableTitles,
} from "@/lib/titles/queries";

export const dynamic = "force-dynamic";

export default async function UnavailablePage() {
  let unavailable: Awaited<ReturnType<typeof listUnavailableTitles>> = [];
  let pending: Awaited<ReturnType<typeof listPendingTitles>> = [];
  let error: string | null = null;

  if (!process.env.DATABASE_URL) {
    error = "DATABASE_URL is not set.";
  } else {
    try {
      [unavailable, pending] = await Promise.all([
        listUnavailableTitles(),
        listPendingTitles(),
      ]);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <>
      <SiteNav current="/unavailable" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Unavailable</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Checked titles still on your list with no subscription-ish offer on
            Max, Netflix, Prime, or YouTube TV.
          </p>
        </div>
        {error ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </p>
        ) : (
          <>
            {pending.length > 0 ? (
              <p className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                {pending.length} title{pending.length === 1 ? "" : "s"} still
                pending availability sync (not listed below until checked).
              </p>
            ) : null}
            <TitleList
              titles={unavailable}
              emptyMessage={
                pending.length > 0
                  ? "No checked-unavailable titles yet — finish availability sync first."
                  : "No unavailable titles — either the list is empty or everything is available."
              }
            />
          </>
        )}
      </main>
    </>
  );
}
