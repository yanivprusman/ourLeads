import { NextResponse } from "next/server";
import { asUser } from "@/lib/http";
import { replyByHand } from "@/lib/assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Answer the customer on the business line, by hand. `{ text }` */
export async function POST(request: Request, ctx: RouteContext<"/api/leads/[id]/reply">) {
  return asUser(request, async (user) => {
    const body = (await request.json().catch(() => ({}))) as { text?: unknown };
    if (typeof body.text !== "string" || !body.text.trim()) return NextResponse.json({ error: "text is required" }, { status: 400 });
    try {
      await replyByHand(Number((await ctx.params).id), body.text, user.name);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }
  });
}
