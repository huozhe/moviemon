import { SiteNav } from "@/components/SiteNav";
import { TitleList } from "@/components/TitleList";
import { listAvailableTitles } from "@/lib/titles/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let titles: Awaited<ReturnType<typeof listAvailableTitles>> = [];
  let error: string | null = null;

  if (!process.env.DATABASE_URL) {
    error =
      "DATABASE_URL is not set. Connect Neon via Vercel Marketplace, then run migrations and seed.";
  } else {
    try {
      titles = await listAvailableTitles();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <>
      <SiteNav current="/" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Available now</h1>
          <p className="mt-1 text-sm text-zinc-600">
            On your IMDb watchlist and streamable on an enabled service (US
            subscription / free / ads).
          </p>
        </div>
        {error ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </p>
        ) : (
          <TitleList
            titles={titles}
            emptyMessage="No available titles yet. Run a watchlist + availability sync after setup."
          />
        )}
      </main>
    </>
  );
}
