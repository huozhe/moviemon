import { SiteNav } from "@/components/SiteNav";
import { TitleList } from "@/components/TitleList";
import { listUnavailableTitles } from "@/lib/titles/queries";

export const dynamic = "force-dynamic";

export default async function UnavailablePage() {
  let titles: Awaited<ReturnType<typeof listUnavailableTitles>> = [];
  let error: string | null = null;

  if (!process.env.DATABASE_URL) {
    error = "DATABASE_URL is not set.";
  } else {
    try {
      titles = await listUnavailableTitles();
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
            Still on your list, but not on Max, Netflix, Prime, or YouTube TV
            (subscription-ish offers only).
          </p>
        </div>
        {error ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </p>
        ) : (
          <TitleList
            titles={titles}
            emptyMessage="No unavailable titles — either the list is empty or everything is available."
          />
        )}
      </main>
    </>
  );
}
