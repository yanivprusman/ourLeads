import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { asUser } from "@/lib/http";
import { dataDir } from "@/lib/config";
import { addEvent, getDb, getLead, now } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Photos added straight to a lead — from a site visit, say. They do NOT go through
 * WhatsApp: the board reads the partner chats whole, and a burst of photos sent
 * there would be read by the extractor as a new lead, or attached to the wrong one.
 *
 * Each photo is stored as a message row of its own (chat `upload`, already `done`,
 * already on the lead), so everything that shows a lead's photos — the board, the
 * phone, a shared card, the phone-number check — sees it with no special case.
 * The ingest never touches it: it reads only the partner chats and only `pending` rows.
 */
const UPLOAD_CHAT = "upload";
const MAX_FILES = 30;
const MAX_BYTES = 20 * 1024 * 1024;

/** The file's own bytes decide what it is, not the name or the type the client claimed. */
function extOf(b: Buffer): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ".jpg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ".png";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return ".webp";
  return null;
}

export async function POST(request: Request, ctx: RouteContext<"/api/leads/[id]/photos">) {
  return asUser(request, async (user) => {
    const id = Number((await ctx.params).id);
    const lead = getLead(id);
    if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });
    const files = (await request.formData()).getAll("photo").filter((f): f is File => f instanceof Blob && f.size > 0);
    if (!files.length) return NextResponse.json({ error: "no photos" }, { status: 400 });
    if (files.length > MAX_FILES) return NextResponse.json({ error: `up to ${MAX_FILES} photos at a time` }, { status: 400 });
    // Read and check every file before writing any, so a bad one rejects the batch instead of half of it.
    const items: { bytes: Buffer; ext: string }[] = [];
    for (const f of files) {
      if (f.size > MAX_BYTES) return NextResponse.json({ error: `a photo is over ${MAX_BYTES / 1024 / 1024} MB` }, { status: 400 });
      const bytes = Buffer.from(await f.arrayBuffer());
      const ext = extOf(bytes);
      if (!ext) return NextResponse.json({ error: "only JPEG, PNG or WebP photos" }, { status: 400 });
      items.push({ bytes, ext });
    }
    const dir = path.join(dataDir(), "media");
    const ins = getDb().prepare(
      `INSERT INTO messages (id, chat_jid, source, from_me, sent_at, content, media_type, media_file, lead_id, state)
       VALUES (?, ?, ?, 1, ?, '', 'image', ?, ?, 'done')`,
    );
    const at = now();
    for (const it of items) {
      const msgId = `up-${randomUUID()}`;
      const file = `${msgId}${it.ext}`;
      await writeFile(path.join(dir, file), it.bytes);
      ins.run(msgId, UPLOAD_CHAT, lead.source, at, file, id);
    }
    addEvent(id, user.name, "photos", items.length === 1 ? "הוסיף תמונה" : `הוסיף ${items.length} תמונות`);
    getDb().prepare("UPDATE leads SET updated_at = ? WHERE id = ?").run(at, id);
    return NextResponse.json({ ok: true, added: items.length });
  });
}
