import { authorizeCron } from "@/lib/sync/auth";
import { syncAvailability } from "@/lib/sync/sync-availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await syncAvailability();
  const status = result.status === "ok" ? 200 : 500;
  return Response.json(result, { status });
}
