import {
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const res = Response.json({ status: "ok" });
  const opts = sessionCookieOptions(0);
  res.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=${opts.path}; Max-Age=0; SameSite=Lax; HttpOnly${
      opts.secure ? "; Secure" : ""
    }`,
  );
  return res;
}
