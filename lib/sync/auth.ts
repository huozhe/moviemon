import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron sends Authorization: Bearer <CRON_SECRET>.
 * Manual sync may use the same secret (or SYNC_SECRET if set).
 *
 * Callers all run on the Node runtime, so node:crypto is available.
 */
export function authorizeCron(req: Request): boolean {
  return bearerMatches(req, process.env.CRON_SECRET);
}

export function authorizeManualSync(req: Request): boolean {
  if (authorizeCron(req)) return true;
  return bearerMatches(req, process.env.SYNC_SECRET);
}

/** Constant-time bearer check. Hashes both sides so lengths always match. */
function bearerMatches(req: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const header = req.headers.get("authorization");
  if (!header) return false;
  return timingSafeEqual(sha256(header), sha256(`Bearer ${secret}`));
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}
