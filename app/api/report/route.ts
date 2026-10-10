import { NextResponse } from "next/server";
import { asUser } from "@/lib/http";
import { reportText, sendReport } from "@/lib/cardText";
import { isTextTarget } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `ids` (JSON or "1,2,3"): only these leads; absent = every open lead. Null = invalid. */
function parseIds(v: unknown): number[] | undefined | null {
  if (v === undefined || v === null || v === "") return undefined;
  const list = typeof v === "string" ? v.split(",") : v;
  if (!Array.isArray(list)) return null;
  const ids = list.map(Number);
  return ids.every((n) => Number.isInteger(n) && n > 0) ? ids : null;
}

/** The report as it would be sent — to read before sending. `?ids=1,2,3` narrows it to those leads. */
export async function GET(request: Request) {
  return asUser(request, () => {
    const ids = parseIds(new URL(request.url).searchParams.get("ids"));
    if (ids === null) return NextResponse.json({ error: "ids must be lead numbers, e.g. 1,2,3" }, { status: 400 });
    try {
      return NextResponse.json(reportText(ids));
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  });
}

/** Send the report as WhatsApp text. `{ to: "preview", ids?: [1, 2] }` */
export async function POST(request: Request) {
  return asUser(request, async (user) => {
    const body = (await request.json().catch(() => ({}))) as { to?: unknown; ids?: unknown };
    if (!isTextTarget(body.to)) return NextResponse.json({ error: 'to must be "preview"' }, { status: 400 });
    const ids = parseIds(body.ids);
    if (ids === null) return NextResponse.json({ error: "ids must be a list of lead numbers" }, { status: 400 });
    try {
      return NextResponse.json(await sendReport(user.name, body.to, ids));
    } catch (e) {
      return NextResponse.json({ error: `השליחה נכשלה: ${(e as Error).message}` }, { status: 502 });
    }
  });
}
