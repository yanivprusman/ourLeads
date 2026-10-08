import { NextResponse } from "next/server";
import { asUser } from "@/lib/http";
import { deleteEvent, editEvent } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Correct a history line. `{ text: "..." }` */
export async function PATCH(request: Request, ctx: RouteContext<"/api/events/[id]">) {
  return asUser(request, async (user) => {
    const body = (await request.json().catch(() => ({}))) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return NextResponse.json({ error: "text is required — to remove the line, delete it" }, { status: 400 });
    if (!editEvent(Number((await ctx.params).id), text, user.name)) return NextResponse.json({ error: "אין שורה כזו" }, { status: 404 });
    return NextResponse.json({ ok: true });
  });
}

/** Take a history line off the lead. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/events/[id]">) {
  return asUser(request, async (user) => {
    if (!deleteEvent(Number((await ctx.params).id), user.name)) return NextResponse.json({ error: "אין שורה כזו" }, { status: 404 });
    return NextResponse.json({ ok: true });
  });
}
