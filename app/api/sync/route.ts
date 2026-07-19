import { authorizeManualSync } from "@/lib/sync/auth";
import { syncWatchlist } from "@/lib/sync/sync-watchlist";
import { syncAvailability } from "@/lib/sync/sync-availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Manual sync (settings "Sync now").
 * Body: { "kind": "watchlist" | "availability" | "both" }
 * Auth: Authorization: Bearer <CRON_SECRET or SYNC_SECRET>
 */
export async function POST(req: Request) {
  if (!authorizeManualSync(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let kind: "watchlist" | "availability" | "both" = "both";
  try {
    const body = (await req.json()) as { kind?: string };
    if (
      body.kind === "watchlist" ||
      body.kind === "availability" ||
      body.kind === "both"
    ) {
      kind = body.kind;
    }
  } catch {
    // empty body → both
  }

  const results: Record<string, unknown> = {};

  if (kind === "watchlist" || kind === "both") {
    results.watchlist = await syncWatchlist();
  }
  if (kind === "availability" || kind === "both") {
    results.availability = await syncAvailability();
  }

  const failed = Object.values(results).some(
    (r) =>
      typeof r === "object" &&
      r !== null &&
      "status" in r &&
      (r as { status: string }).status === "error",
  );

  return Response.json(results, { status: failed ? 500 : 200 });
}
