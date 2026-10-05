import { NextResponse } from "next/server";
import { asUser } from "@/lib/http";
import { isStatus, updateLead, type LeadPatch } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A change made by hand: a status tapped, a field corrected, a note typed. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/leads/[id]">) {
  return asUser(request, async (user) => {
    const id = Number((await ctx.params).id);
    const body = (await request.json()) as Record<string, unknown>;
    if (body.status !== undefined && !isStatus(body.status))
      return NextResponse.json({ error: "unknown status" }, { status: 400 });
    const patch: LeadPatch = {};
    const str = (k: string) => (body[k] === null ? null : String(body[k]).trim() || null);
    if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
    if ("customerName" in body) patch.customer_name = str("customerName");
    if ("address" in body) patch.address = str("address");
    if ("city" in body) patch.city = str("city");
    if ("details" in body) patch.details = str("details");
    if ("nextStep" in body) patch.next_step = str("nextStep");
    if ("visitAt" in body) patch.visit_at = str("visitAt");
    if (Array.isArray(body.phones)) patch.phones = body.phones.map((p) => String(p).replace(/\D/g, "")).filter(Boolean);
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
    const lead = updateLead(id, user.name, patch, isStatus(body.status) ? body.status : null, note);
    return NextResponse.json({ ok: true, id: lead.id });
  });
}

/** The phone app's HTTP client has no PATCH verb, so the same change is accepted as POST. */
export { PATCH as POST };
