import { NextResponse } from "next/server";
import { asUser } from "@/lib/http";
import { createShare, listShares, parseHide } from "@/lib/shares";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The links this lead's card has been sent as. */
export async function GET(request: Request, ctx: RouteContext<"/api/leads/[id]/shares">) {
  return asUser(request, async () => NextResponse.json({ shares: listShares(Number((await ctx.params).id)) }));
}

/** A new link to this lead's card, leaving out what `hide` names. `{ hide: ["address", "price"] }` */
export async function POST(request: Request, ctx: RouteContext<"/api/leads/[id]/shares">) {
  return asUser(request, async (user) => {
    const body = (await request.json().catch(() => ({}))) as { hide?: unknown };
    const hide = parseHide(body.hide ?? []);
    if (!hide) return NextResponse.json({ error: "hide must be a list of: contact, address, price, photos, history" }, { status: 400 });
    return NextResponse.json(createShare(Number((await ctx.params).id), hide, user.name));
  });
}
