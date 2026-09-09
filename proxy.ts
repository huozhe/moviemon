import { NextResponse, type NextRequest } from "next/server";
import {
  isAuthEnabled,
  SESSION_COOKIE,
  verifySessionToken,
} from "@/lib/auth/session";

/**
 * Shared-password gate. When SITE_PASSWORD is unset, the site is open
 * (local dev convenience). Cron / secret sync routes skip the cookie check.
 */
export async function proxy(req: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;

  // Login UI + auth APIs
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/")
  ) {
    // Already signed in → home
    if (pathname === "/login") {
      const token = req.cookies.get(SESSION_COOKIE)?.value;
      if (await verifySessionToken(token)) {
        return NextResponse.redirect(new URL("/", req.url));
      }
    }
    return NextResponse.next();
  }

  // Vercel Cron + manual secret sync (Bearer CRON_SECRET / SYNC_SECRET)
  if (
    pathname.startsWith("/api/cron/") ||
    pathname === "/api/sync"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const login = new URL("/login", req.url);
  const next = pathname + req.nextUrl.search;
  if (next && next !== "/") {
    login.searchParams.set("next", next);
  }
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static assets.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
