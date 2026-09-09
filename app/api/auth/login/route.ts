import {
  createSessionToken,
  isAuthEnabled,
  sessionCookieOptions,
  SESSION_COOKIE,
  verifyPassword,
} from "@/lib/auth/session";
import {
  clearLoginFailures,
  clientIp,
  loginRetryAfter,
  recordLoginFailure,
} from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isAuthEnabled()) {
    return Response.json(
      { error: "Login is not configured (SITE_PASSWORD unset)" },
      { status: 400 },
    );
  }

  const ip = clientIp(req);
  const retryAfter = loginRetryAfter(ip);
  if (retryAfter > 0) {
    return Response.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  let password = "";
  try {
    const body = (await req.json()) as { password?: string };
    if (typeof body.password === "string") password = body.password;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!password) {
    return Response.json({ error: "Password required" }, { status: 400 });
  }

  const ok = await verifyPassword(password);
  if (!ok) {
    recordLoginFailure(ip);
    return Response.json({ error: "Incorrect password" }, { status: 401 });
  }
  clearLoginFailures(ip);

  let token: string;
  try {
    token = await createSessionToken();
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Could not create session (check AUTH_SECRET)",
      },
      { status: 500 },
    );
  }

  const res = Response.json({ status: "ok" });
  const opts = sessionCookieOptions();
  res.headers.append(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE, token, opts),
  );
  return res;
}

function serializeCookie(
  name: string,
  value: string,
  opts: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax" | "strict" | "none";
    path: string;
    maxAge: number;
  },
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${opts.path}`,
    `Max-Age=${opts.maxAge}`,
    `SameSite=${opts.sameSite.charAt(0).toUpperCase()}${opts.sameSite.slice(1)}`,
  ];
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}
