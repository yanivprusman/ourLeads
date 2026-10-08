import { NextResponse } from "next/server";
import { asUser } from "@/lib/http";
import { clearPreview } from "@/lib/cardText";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Delete for everyone every message this app put in the preview group (קבוצה ריקה). */
export async function POST(request: Request) {
  return asUser(request, async (user) => {
    try {
      return NextResponse.json(await clearPreview(user.name));
    } catch (e) {
      return NextResponse.json({ error: `המחיקה נכשלה: ${(e as Error).message}` }, { status: 502 });
    }
  });
}
