import { NextResponse } from "next/server";
import { asUser } from "@/lib/http";
import { getLead } from "@/lib/db";
import { resolveProposal } from "@/lib/proposal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Confirm (`{accept: true}`) or reject (`{accept: false}`) the change the customer's chat proposed. */
export async function POST(request: Request, ctx: RouteContext<"/api/leads/[id]/proposal">) {
  return asUser(request, async (user) => {
    const id = Number((await ctx.params).id);
    const body = (await request.json()) as { accept?: unknown };
    if (typeof body.accept !== "boolean") return NextResponse.json({ error: "accept must be true or false" }, { status: 400 });
    const lead = getLead(id);
    if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });
    if (!lead.proposal) return NextResponse.json({ error: "אין הצעה שמחכה לאישור — אולי השותף כבר החליט" }, { status: 409 });
    resolveProposal(id, user.name, body.accept);
    return NextResponse.json({ ok: true });
  });
}
