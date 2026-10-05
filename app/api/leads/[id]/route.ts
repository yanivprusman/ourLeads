import { NextResponse } from "next/server";
import { asUser } from "@/lib/http";
import { addEvent, isStatus, updateLead, type LeadPatch } from "@/lib/db";
import { DEAL_KEYS, describeDeal } from "@/lib/deal";

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
    const num = (k: string) => {
      if (body[k] === null || body[k] === "") return null;
      const n = Number(String(body[k]).replace(/[^\d.]/g, ""));
      return Number.isFinite(n) ? n : null;
    };
    const flag = (k: string) => (body[k] === null ? null : body[k] ? 1 : 0);
    if ("clientPrice" in body) patch.client_price = num("clientPrice");
    if ("clientVat" in body) patch.client_vat = flag("clientVat");
    if ("subName" in body) patch.sub_name = str("subName");
    if ("subPhone" in body) patch.sub_phone = body.subPhone ? String(body.subPhone).replace(/\D/g, "").replace(/^972/, "0") || null : null;
    if ("subPrice" in body) patch.sub_price = num("subPrice");
    if ("subVat" in body) patch.sub_vat = flag("subVat");
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
    const lead = updateLead(id, user.name, patch, isStatus(body.status) ? body.status : null, note);
    if (DEAL_KEYS.some((k) => k in patch)) addEvent(id, user.name, "deal", describeDeal(lead));
    return NextResponse.json({ ok: true, id: lead.id });
  });
}

/** The phone app's HTTP client has no PATCH verb, so the same change is accepted as POST. */
export { PATCH as POST };
