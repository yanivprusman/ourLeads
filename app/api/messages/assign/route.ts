import { NextResponse } from "next/server";
import { asUser } from "@/lib/http";
import { addEvent, getDb, getLead } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Move a message the extractor left unassigned onto a lead. */
export async function POST(request: Request) {
  return asUser(request, async (user) => {
    const { id, chatJid, leadId } = (await request.json()) as { id: string; chatJid: string; leadId: number };
    if (!getLead(leadId)) return NextResponse.json({ error: "no such lead" }, { status: 404 });
    const r = getDb()
      .prepare("UPDATE messages SET lead_id = ?, state = 'done' WHERE id = ? AND chat_jid = ?")
      .run(leadId, id, chatJid);
    if (!r.changes) return NextResponse.json({ error: "no such message" }, { status: 404 });
    addEvent(leadId, user.name, "note", "צירף הודעה מהוואטסאפ ידנית");
    return NextResponse.json({ ok: true });
  });
}
