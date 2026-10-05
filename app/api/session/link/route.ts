import { sessionCookieHeader, userByLink } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sign a browser in from a link made by `scripts/make-link.mjs` — the way to
 * hand a partner the board: one WhatsApp message, one tap.
 * Answers with a page that navigates rather than a redirect, so the cookie set
 * here is carried on a same-site navigation.
 */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const user = userByLink(p.get("u") ?? "", Number(p.get("exp")), p.get("sig") ?? "");
  if (!user) return new Response(null, { status: 303, headers: { Location: "/signin/expired" } });
  return new Response(
    '<!doctype html><meta charset="utf-8"><title>ourLeads</title><script>location.replace("/")</script>',
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Set-Cookie": sessionCookieHeader(request, user),
      },
    },
  );
}
