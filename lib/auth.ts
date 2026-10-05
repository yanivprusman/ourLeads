import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { users, type User } from "./config";

/**
 * Who is asking.
 *
 * Each partner has their own secret in `OURLEADS_USERS`, held two ways:
 *  - the phone app sends it as a bearer token;
 *  - a browser signs in once (with the secret, or a timed link from
 *    `scripts/make-link.mjs`) and holds a cookie that is an HMAC of it — the
 *    secret never sits in a browser, and rotating a person's token signs every
 *    one of their browsers out, with no session table to forget to clear.
 *
 * The board holds customers' names, phones and addresses, so nothing is
 * readable without one of these — including the media files, which are
 * addressed by a signed URL instead (an <img> cannot carry a bearer token).
 */
export { SESSION_COOKIE } from "./auth-cookie";
import { SESSION_COOKIE } from "./auth-cookie";
const SESSION_MAX_AGE_S = 365 * 24 * 60 * 60;

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function mac(key: string, message: string): string {
  return createHmac("sha256", key).update(message).digest("hex");
}

function sessionValue(u: User): string {
  return `${u.id}.${mac(u.token, "ourleads-web-session-v1")}`;
}

export function userByToken(token: string): User | null {
  return users().find((u) => same(token, u.token)) ?? null;
}

export function userBySession(value: string | undefined): User | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot < 1) return null;
  const u = users().find((x) => x.id === value.slice(0, dot));
  return u && same(value, sessionValue(u)) ? u : null;
}

export function userByLink(id: string, exp: number, sig: string): User | null {
  const u = users().find((x) => x.id === id);
  if (!u || !Number.isInteger(exp) || exp * 1000 < Date.now()) return null;
  return same(sig, mac(u.token, `ourleads-web-link-v1:${exp}`)) ? u : null;
}

export function sessionCookieHeader(request: Request, u: User): string {
  const https = request.headers.get("x-forwarded-proto") === "https";
  return (
    `${SESSION_COOKIE}=${sessionValue(u)}; Path=/; Max-Age=${SESSION_MAX_AGE_S}; ` +
    `HttpOnly; SameSite=Lax${https ? "; Secure" : ""}`
  );
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

function cookieFrom(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

function fromOwnOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export type Authed = { user: User } | { error: string };

export function authorize(request: Request): Authed {
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Bearer ")) {
    const u = userByToken(header.slice(7).trim());
    return u ? { user: u } : { error: "bad token" };
  }
  const u = userBySession(cookieFrom(request, SESSION_COOKIE));
  if (!u) return { error: "not signed in" };
  if (request.method !== "GET" && !fromOwnOrigin(request)) return { error: "cross-origin request refused" };
  return { user: u };
}

/** Media is addressed by a signature over its file name, under a key derived
 *  from every partner's token, so it works in an <img> on the web and in the
 *  phone's image loader without either carrying a secret. */
function mediaKey(): string {
  return users().map((u) => u.token).join("|");
}

export function mediaSig(file: string): string {
  return mac(mediaKey(), `ourleads-media-v1:${file}`).slice(0, 32);
}

export function isMediaSig(file: string, sig: string): boolean {
  return same(sig, mediaSig(file));
}
