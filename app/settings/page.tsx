import { SiteNav } from "@/components/SiteNav";
import { listProviders, listRecentSyncRuns } from "@/lib/titles/queries";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let providers: Awaited<ReturnType<typeof listProviders>> = [];
  let syncRuns: Awaited<ReturnType<typeof listRecentSyncRuns>> = [];
  let error: string | null = null;

  if (!process.env.DATABASE_URL) {
    error = "DATABASE_URL is not set.";
  } else {
    try {
      [providers, syncRuns] = await Promise.all([
        listProviders(),
        listRecentSyncRuns(8),
      ]);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <>
      <SiteNav current="/settings" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Providers, last sync status, and manual sync (secret-gated API).
          </p>
        </div>

        {error ? (
          <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </p>
        ) : null}

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Providers
          </h2>
          {providers.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No providers seeded. Run{" "}
              <code className="rounded bg-zinc-100 px-1">npm run seed</code>{" "}
              after migrations.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
              {providers.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between px-4 py-3 text-sm"
                >
                  <span className="font-medium">{p.name}</span>
                  <span
                    className={
                      p.enabled
                        ? "text-emerald-700"
                        : "text-zinc-400 line-through"
                    }
                  >
                    {p.enabled ? "Enabled" : "Disabled"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Recent sync runs
          </h2>
          {syncRuns.length === 0 ? (
            <p className="text-sm text-zinc-500">No sync runs recorded yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white text-sm">
              {syncRuns.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{r.kind}</span>
                    <span
                      className={
                        r.status === "ok" ? "text-emerald-700" : "text-red-600"
                      }
                    >
                      {r.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {r.startedAt?.toISOString?.() ?? String(r.startedAt)}
                    {r.error ? ` · ${r.error}` : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
          <h2 className="mb-2 font-semibold text-zinc-900">Watchlist source</h2>
          <p>
            IMDb blocks server HTML scrapes (AWS WAF). Set{" "}
            <code className="rounded bg-zinc-100 px-1">
              IMDB_WATCHLIST_CSV_URL
            </code>{" "}
            to a hosted IMDb export CSV (Gist raw URL, etc.), or POST{" "}
            <code className="rounded bg-zinc-100 px-1">csvText</code> below.
          </p>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
          <h2 className="mb-2 font-semibold text-zinc-900">Manual sync</h2>
          <p className="mb-2">
            POST{" "}
            <code className="rounded bg-zinc-100 px-1">/api/sync</code> with
            header{" "}
            <code className="rounded bg-zinc-100 px-1">
              Authorization: Bearer $CRON_SECRET
            </code>
            .
          </p>
          <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-100">
            {`curl -X POST "$ORIGIN/api/sync" \\
  -H "Authorization: Bearer $CRON_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{"kind":"both"}'

# one-off with local IMDb CSV export:
# jq -n --rawfile c ~/Downloads/watchlist.csv '{kind:"watchlist",csvText:$c}' \\
#   | curl -sS -X POST "$ORIGIN/api/sync" \\
#       -H "Authorization: Bearer $CRON_SECRET" \\
#       -H "Content-Type: application/json" -d @-`}
          </pre>
        </section>
      </main>
    </>
  );
}
