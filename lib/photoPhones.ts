import "server-only";
import path from "node:path";
import { askJson } from "./claude";
import { dataDir } from "./config";
import { getDb } from "./db";

/**
 * Which photos give the customer's phone number away.
 *
 * Most leads arrive as screenshots of the customer's chat. Some show the whole
 * number in the header, some only part of it (a cropped header, a saved-contact
 * name with the number half off-screen), some none. A card shared "without the
 * customer's details" must leave out exactly the ones that show the whole number:
 * part of a number cannot reach anyone (Yaniv, 2026-10-06: keep those), and
 * leaving every photo out would drop the most useful part of the card.
 *
 * Each photo is looked at once and the answer stored on its message
 * (`phone_shown`: none | partial | full). Until it has been looked at, a photo is
 * treated as showing the number — an unknown is not a "no".
 */
export type PhoneShown = "none" | "partial" | "full";
const BATCH = 8;

const SCHEMA = {
  type: "object",
  properties: {
    photos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file: { type: "string" },
          phone: { type: "string", enum: ["none", "partial", "full"] },
        },
        required: ["file", "phone"],
      },
    },
  },
  required: ["photos"],
};

/** Run by the WhatsApp reader after each pass; a few photos at a time, so a backlog never holds up new leads. */
export async function classifyPhotos(log: (...a: unknown[]) => void): Promise<void> {
  const d = getDb();
  const rows = d
    .prepare(
      `SELECT id, chat_jid, media_file FROM messages
       WHERE media_type = 'image' AND media_file IS NOT NULL AND phone_shown IS NULL
       ORDER BY sent_at DESC LIMIT ?`,
    )
    .all(BATCH) as { id: string; chat_jid: string; media_file: string }[];
  if (!rows.length) return;
  const dir = path.join(dataDir(), "media");
  const prompt = [
    "לפניך תמונות מליד של עבודה — לרוב צילומי מסך של שיחת וואטסאפ עם לקוח, לפעמים צילום של המקום.",
    "פתח כל תמונה (Read) וקבע אם רואים בה מספר טלפון שלם, חלק ממספר, או שאין מספר.",
    "full = מספר טלפון שלם וקריא (למשל 050-1234567 או ‎+972 50-123-4567) — אפשר להתקשר אליו מהתמונה.",
    "partial = רואים רק חלק מהמספר (חתוך, מטושטש, מוסתר בחלקו) — אי אפשר להתקשר אליו מהתמונה.",
    "none = אין בתמונה מספר טלפון.",
    "ענה על כל קובץ, בשם הקובץ בדיוק כפי שמופיע כאן:",
    ...rows.map((r) => path.join(dir, r.media_file)),
  ].join("\n");
  const answer = await askJson<{ photos: { file: string; phone: PhoneShown }[] }>(prompt, SCHEMA, dir);
  const set = d.prepare("UPDATE messages SET phone_shown = ? WHERE id = ? AND chat_jid = ?");
  let done = 0;
  for (const r of rows) {
    const a = answer.photos.find((p) => path.basename(p.file) === r.media_file);
    if (!a) continue;
    set.run(a.phone, r.id, r.chat_jid);
    done++;
  }
  log(`photos: checked ${done}/${rows.length} for a visible phone number`);
}
