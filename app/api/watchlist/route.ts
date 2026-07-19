import {
  addTitleToWatchlist,
  removeTitleFromWatchlist,
} from "@/lib/watchlist/manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Manage the MovieMon watchlist (source of truth in Neon).
 *
 * POST   { "imdbId": "tt…" | url }  → add / re-add
 * DELETE { "imdbId": "tt…" | url }  → soft-remove (on_list=false)
 *
 * No auth (single-tenant personal tool). Protect the deployment URL if needed.
 */
export async function POST(req: Request) {
  let imdbId: string | undefined;
  try {
    const body = (await req.json()) as { imdbId?: string };
    if (typeof body.imdbId === "string") imdbId = body.imdbId;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!imdbId?.trim()) {
    return Response.json(
      { error: "imdbId is required (tt… or IMDb title URL)" },
      { status: 400 },
    );
  }

  const result = await addTitleToWatchlist(imdbId);
  if (result.status === "error") {
    return Response.json(result, { status: 400 });
  }
  return Response.json(result, { status: 200 });
}

export async function DELETE(req: Request) {
  let imdbId: string | undefined;
  try {
    const body = (await req.json()) as { imdbId?: string };
    if (typeof body.imdbId === "string") imdbId = body.imdbId;
  } catch {
    // allow ?imdbId= for simple clients
  }

  if (!imdbId?.trim()) {
    const url = new URL(req.url);
    imdbId = url.searchParams.get("imdbId") ?? undefined;
  }

  if (!imdbId?.trim()) {
    return Response.json({ error: "imdbId is required" }, { status: 400 });
  }

  const result = await removeTitleFromWatchlist(imdbId);
  if (result.status === "error") {
    return Response.json(result, { status: 400 });
  }
  return Response.json(result, { status: 200 });
}
