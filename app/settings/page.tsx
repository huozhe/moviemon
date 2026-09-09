import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { PageHeader } from "@/components/PageHeader";
import { RelativeTime } from "@/components/RelativeTime";
import { AddTitleForm } from "@/components/AddTitleForm";
import {
  getListStats,
  listPendingTitles,
  listProviders,
  listRecentSyncRuns,
} from "@/lib/titles/queries";

export const dynamic = "force-dynamic";

/**
 * Sync errors are stored verbatim and shown here. Strip anything that could
 * carry a credential (connection strings, apiKey params, bearer tokens)
 * before it reaches the page.
 */
function redactError(raw: string): string {
  return raw
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, "$1[redacted]@")
    .replace(/([?&](?:api_?key|token|secret)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 300);
}

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  let providers: Awaited<ReturnType<typeof listProviders>> = [];
  let syncRuns: Awaited<ReturnType<typeof listRecentSyncRuns>> = [];
  let pendingCount = 0;
  let stats = { available: 0, unavailable: 0, pending: 0, onList: 0 };
  let error: string | null = null;

  if (!process.env.DATABASE_URL) {
    error = "DATABASE_URL is not set.";
  } else {
    try {
      const [p, runs, pending, s] = await Promise.all([
        listProviders(),
        listRecentSyncRuns(8),
        listPendingTitles(),
        getListStats(),
      ]);
      providers = p;
      syncRuns = runs;
      pendingCount = pending.length;
      stats = s;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const lastRateLimited = syncRuns.find(
    (r) =>
      r.kind === "availability" &&
      (r.status === "partial" || r.status === "error") &&
      (r.error?.includes("429") ||
        (r.stats &&
          typeof r.stats === "object" &&
          (r.stats as { rateLimited?: boolean }).rateLimited)),
  );

  return (
    <>
      <SiteNav
        current="/settings"
        counts={{
          available: stats.available,
          unavailable: stats.unavailable,
          pending: stats.pending,
        }}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-16">
        <PageHeader
          eyebrow="System"
          title="Settings"
          description="MovieMon is the source of truth for your watchlist. Manage titles here; availability refreshes on a schedule. Site access uses a shared password when configured."
        />

        {error ? (
          <div
            role="alert"
            className="mb-6 rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger ring-1 ring-danger/30"
          >
            {error}
          </div>
        ) : null}

        <section className="mb-6 grid grid-cols-3 gap-2">
          {[
            { label: "On list", value: stats.onList },
            { label: "Available", value: stats.available },
            { label: "Pending", value: pendingCount },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl bg-raised px-3 py-3 text-center ring-1 ring-border"
            >
              <p className="font-display text-xl font-bold tabular-nums text-ink">
                {s.value}
              </p>
              <p className="mt-0.5 text-[11px] uppercase tracking-wide text-faint">
                {s.label}
              </p>
            </div>
          ))}
        </section>

        {pendingCount > 0 ? (
          <div className="mb-6 rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent ring-1 ring-accent/25">
            Availability catch-up: <strong>{pendingCount}</strong> title
            {pendingCount === 1 ? "" : "s"} not checked yet (about 12 per sync
            run). Watchmode free quota is low — if you see HTTP 429 in the log,
            wait and re-run; failed titles cool down ~2h so the same id is not
            hammered every pass.
          </div>
        ) : null}

        {lastRateLimited ? (
          <div className="mb-6 rounded-2xl bg-warn/10 px-4 py-3 text-sm text-warn ring-1 ring-warn/30">
            Last availability sync hit a Watchmode rate limit
            {lastRateLimited.error ? (
              <>
                {" "}
                (
                <span className="font-mono text-[11px]">
                  {redactError(lastRateLimited.error).slice(0, 80)}
                  {lastRateLimited.error.length > 80 ? "…" : ""}
                </span>
                )
              </>
            ) : null}
            . Progress from that run is kept; retry later.
          </div>
        ) : null}

        <section className="mb-8">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-[0.12em] text-faint">
            Services
          </h2>
          {providers.length === 0 ? (
            <p className="text-sm text-muted">
              No providers seeded. Run{" "}
              <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-xs text-accent ring-1 ring-border">
                npm run seed
              </code>{" "}
              after migrations.
            </p>
          ) : (
            <ul className="overflow-hidden rounded-2xl ring-1 ring-border">
              {providers.map((p, i) => (
                <li
                  key={p.id}
                  className={`flex items-center justify-between bg-raised px-4 py-3 text-sm ${
                    i > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <span className="font-medium text-ink">{p.name}</span>
                  <span
                    className={
                      p.enabled
                        ? "rounded-full bg-ok/15 px-2 py-0.5 text-xs font-semibold text-ok"
                        : "rounded-full bg-surface px-2 py-0.5 text-xs text-faint line-through"
                    }
                  >
                    {p.enabled ? "On" : "Off"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-8">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-[0.12em] text-faint">
            Recent syncs
          </h2>
          {syncRuns.length === 0 ? (
            <p className="text-sm text-muted">No sync runs recorded yet.</p>
          ) : (
            <ul className="overflow-hidden rounded-2xl ring-1 ring-border">
              {syncRuns.map((r, i) => {
                const ok = r.status === "ok";
                const partial = r.status === "partial";
                const iso =
                  r.startedAt instanceof Date
                    ? r.startedAt.toISOString()
                    : r.startedAt
                      ? new Date(r.startedAt).toISOString()
                      : null;
                return (
                  <li
                    key={r.id}
                    className={`bg-raised px-4 py-3 text-sm ${
                      i > 0 ? "border-t border-border" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium capitalize text-ink">
                        {r.kind}
                      </span>
                      <span
                        className={
                          ok
                            ? "text-xs font-semibold text-ok"
                            : partial
                              ? "text-xs font-semibold text-warn"
                              : "text-xs font-semibold text-danger"
                        }
                      >
                        {r.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-faint">
                      <RelativeTime iso={iso} />
                      {r.error ? (
                        <span className="mt-1 block max-h-16 overflow-hidden text-danger/90">
                          {redactError(r.error)}
                        </span>
                      ) : null}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="mb-8 rounded-2xl bg-raised p-4 ring-1 ring-border">
          <h2 className="font-display text-base font-semibold text-ink">
            Add a title
          </h2>
          <p className="mt-1 mb-4 text-sm leading-relaxed text-muted">
            Paste an IMDb id or title page URL. Metadata is loaded from IMDb
            GraphQL; the list itself lives only in MovieMon.
          </p>
          <AddTitleForm />
        </section>

        <section className="mb-6 rounded-2xl bg-raised p-4 ring-1 ring-border">
          <h2 className="font-display text-base font-semibold text-ink">
            Watchlist source of truth
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            <strong className="font-medium text-ink">This site + Neon</strong>{" "}
            own the list. Use <strong className="font-medium text-ink">Remove</strong>{" "}
            on any card, or add titles above. IMDb is only for bootstrap (one-time
            CSV) and metadata lookups — daily import is off and re-import never
            deletes titles you keep here.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Optional one-time bootstrap:{" "}
            <code className="rounded bg-void px-1.5 py-0.5 font-mono text-[11px] text-accent">
              POST /api/sync
            </code>{" "}
            with{" "}
            <code className="rounded bg-void px-1.5 py-0.5 font-mono text-[11px] text-accent">
              {"{"}&quot;kind&quot;:&quot;watchlist&quot;,&quot;csvText&quot;:&quot;…&quot;{"}"}
            </code>{" "}
            (Bearer secret). Additive only.
          </p>
        </section>

        <details className="rounded-2xl bg-raised ring-1 ring-border open:pb-1">
          <summary className="cursor-pointer list-none px-4 py-3 font-display text-base font-semibold text-ink marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between gap-2">
              Manual availability sync (API)
              <span className="text-xs font-normal text-faint">curl</span>
            </span>
          </summary>
          <div className="border-t border-border px-4 py-3 text-sm text-muted">
            <p className="mb-3">
              Send{" "}
              <code className="rounded bg-void px-1 font-mono text-[11px] text-accent">
                Authorization: Bearer $CRON_SECRET
              </code>{" "}
              to{" "}
              <code className="rounded bg-void px-1 font-mono text-[11px] text-accent">
                POST /api/sync
              </code>
              .
            </p>
            <pre className="overflow-x-auto rounded-xl bg-void p-3 font-mono text-[11px] leading-relaxed text-muted ring-1 ring-border">
              {`curl -X POST "$ORIGIN/api/sync" \\
  -H "Authorization: Bearer $CRON_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{"kind":"availability"}'`}
            </pre>
          </div>
        </details>
      </main>
    </>
  );
}
