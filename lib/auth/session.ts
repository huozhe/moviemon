import { SignJWT, jwtVerify } from "jose";

/** HttpOnly cookie holding a signed session JWT. */
export const SESSION_COOKIE = "moviemon_session";

/** 30 days */
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30;

export function isAuthEnabled(): boolean {
  return Boolean(process.env.SITE_PASSWORD?.trim());
}

function signingKey(): Uint8Array {
  // No CRON_SECRET fallback: that secret is pasted into curl commands and
  // shell history, and reusing it here would let a leak forge sessions.
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "Set AUTH_SECRET to sign login sessions when SITE_PASSWORD is set",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ v: 1 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
    .sign(signingKey());
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, signingKey());
    return true;
  } catch {
    return false;
  }
}

/** Constant-time-ish password check (hash both sides). */
export async function verifyPassword(input: string): Promise<boolean> {
  const expected = process.env.SITE_PASSWORD?.trim();
  if (!expected) return false;

  const a = await sha256Hex(input);
  const b = await sha256Hex(expected);
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function sessionCookieOptions(maxAge = SESSION_MAX_AGE_SEC) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
