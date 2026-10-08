import { NextResponse } from "next/server";
import { asUser } from "@/lib/http";
import { markViewed } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Someone opened the lead. Counts as touching it for "last touched first"; adds nothing to its history. */
export async function POST(request: Request, ctx: RouteContext<"/api/leads/[id]/viewed">) {
  return asUser(request, async () => {
    if (!markViewed(Number((await ctx.params).id))) return NextResponse.json({ error: "lead not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  });
}
