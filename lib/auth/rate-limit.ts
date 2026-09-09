/**
 * Per-IP throttle for the shared-password login.
 *
 * State is in-process, so on serverless it is per instance, not global. That
 * is enough to stop a sustained guessing run against one password; it is not
 * a distributed limiter. Pick a strong SITE_PASSWORD regardless.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
/** Cap the map so a spray of forged IPs cannot grow it without bound. */
const MAX_TRACKED_IPS = 5000;

const failures = new Map<string, number[]>();

/** Seconds the caller must wait, or 0 when a new attempt is allowed. */
export function loginRetryAfter(ip: string): number {
  const recent = recentFailures(ip);
  if (recent.length < MAX_FAILURES) return 0;
  const elapsed = Date.now() - recent[0];
  return Math.max(1, Math.ceil((WINDOW_MS - elapsed) / 1000));
}

export function recordLoginFailure(ip: string): void {
  if (failures.size >= MAX_TRACKED_IPS && !failures.has(ip)) {
    prune();
    if (failures.size >= MAX_TRACKED_IPS) return;
  }
  failures.set(ip, [...recentFailures(ip), Date.now()]);
}

export function clearLoginFailures(ip: string): void {
  failures.delete(ip);
}

function recentFailures(ip: string): number[] {
  const cutoff = Date.now() - WINDOW_MS;
  return (failures.get(ip) ?? []).filter((t) => t > cutoff);
}

function prune(): void {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [ip, times] of failures) {
    if (times.every((t) => t <= cutoff)) failures.delete(ip);
  }
}

/** Best-effort client IP behind the Vercel proxy. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
