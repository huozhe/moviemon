/**
 * Vercel Cron sends Authorization: Bearer <CRON_SECRET>.
 * Manual sync may use the same secret (or SYNC_SECRET if set).
 */
export function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export function authorizeManualSync(req: Request): boolean {
  if (authorizeCron(req)) return true;
  const syncSecret = process.env.SYNC_SECRET;
  if (!syncSecret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${syncSecret}`;
}
