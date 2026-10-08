import { NextResponse } from "next/server";
import { asUser } from "@/lib/http";
import { reportText, sendReport } from "@/lib/cardText";
import { isTextTarget } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The report of every open lead, as it would be sent — to read before sending. */
export async function GET(request: Request) {
  return asUser(request, () => NextResponse.json(reportText()));
}

/** Send the report as WhatsApp text. `{ to: "preview" | "dudu" }` */
export async function POST(request: Request) {
  return asUser(request, async (user) => {
    const body = (await request.json().catch(() => ({}))) as { to?: unknown };
    if (!isTextTarget(body.to)) return NextResponse.json({ error: 'to must be "preview" or "dudu"' }, { status: 400 });
    try {
      return NextResponse.json(await sendReport(user.name, body.to));
    } catch (e) {
      return NextResponse.json({ error: `השליחה נכשלה: ${(e as Error).message}` }, { status: 502 });
    }
  });
}
