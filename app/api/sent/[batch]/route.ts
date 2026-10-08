import { NextResponse } from "next/server";
import { asUser } from "@/lib/http";
import { deleteSend } from "@/lib/cardText";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Delete a send for everyone in WhatsApp — every message in it. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/sent/[batch]">) {
  return asUser(request, async (user) => {
    try {
      return NextResponse.json(await deleteSend((await ctx.params).batch, user.name));
    } catch (e) {
      return NextResponse.json({ error: `המחיקה נכשלה: ${(e as Error).message}` }, { status: 502 });
    }
  });
}
