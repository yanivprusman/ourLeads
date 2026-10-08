import { NextResponse } from "next/server";
import { asUser } from "@/lib/http";
import { sendCardText } from "@/lib/cardText";
import { isTextTarget } from "@/lib/config";
import { parseHide } from "@/lib/shares";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Send this lead's card as WhatsApp text. `{ to: "preview" | "dudu", hide: ["price"] }` */
export async function POST(request: Request, ctx: RouteContext<"/api/leads/[id]/send-text">) {
  return asUser(request, async (user) => {
    const body = (await request.json().catch(() => ({}))) as { hide?: unknown; to?: unknown };
    const hide = parseHide(body.hide ?? []);
    if (!hide) return NextResponse.json({ error: "hide must be a list of: contact, address, price, photos, history" }, { status: 400 });
    if (!isTextTarget(body.to)) return NextResponse.json({ error: 'to must be "preview" or "dudu"' }, { status: 400 });
    try {
      return NextResponse.json(await sendCardText(Number((await ctx.params).id), hide, user.name, body.to));
    } catch (e) {
      return NextResponse.json({ error: `השליחה נכשלה: ${(e as Error).message}` }, { status: 502 });
    }
  });
}
