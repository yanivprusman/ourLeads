import { NextResponse } from "next/server";
import { sessionCookieHeader, userByLink } from "@/lib/auth";
import { claimLink } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sign a browser in from a link made by `scripts/make-link.mjs` — the way to
 * hand a partner the board: one WhatsApp message, one tap.
 *
 * A link works ONCE. Opening it (GET) only shows a page with a button; the tap
 * (POST) is what uses it up. That split is not decoration: WhatsApp fetches a
 * link itself to build the preview, and a link that died on GET would be used up
 * by the preview before Dudu ever tapped it. Previewers and scanners GET; they do
 * not press buttons.
 */
export async function GET(request: Request) {
  // A relative Location: request.url carries the bind address (0.0.0.0:3177),
  // not the host the browser used, so an absolute one would send it nowhere.
  const { search } = new URL(request.url);
  return new Response(null, { status: 303, headers: { Location: `/signin/link${search}` } });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { u?: string; exp?: number | string; sig?: string };
  const exp = Number(body.exp);
  const sig = String(body.sig ?? "");
  const user = userByLink(String(body.u ?? ""), exp, sig);
  if (!user) return NextResponse.json({ error: "expired" }, { status: 401 });
  if (!claimLink(sig, user.id, exp)) return NextResponse.json({ error: "used" }, { status: 409 });
  return NextResponse.json({ ok: true }, { headers: { "Set-Cookie": sessionCookieHeader(request, user) } });
}
