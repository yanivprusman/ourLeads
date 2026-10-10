import "server-only";
import path from "node:path";
import { sendMedia, sendText } from "./bridge";
import { ASSISTANT, dataDir } from "./config";
import { cloud, cloudConfigured, downloadCloudMedia, localPhone, waIdOf } from "./cloud";
import { getDb, type MessageRow } from "./db";
import { BUSINESS_SOURCE } from "./assistant";
import { OWNER, israelTime } from "./ingest";

/**
 * The business line, cloned into one WhatsApp group on Yaniv's personal number
 * (`mirror_jid` in the Cloud API config — the group "clone", only he is in it).
 *
 * Every message on the line — the customer's, the assistant's, Yaniv's own — is
 * copied there as it is, photos and voice notes included, so the line reads like
 * a phone he is holding. It is a copy and nothing more: it does not wait for a
 * lead, a classification or the busy switch, and it ignores whether the sender is
 * a customer. Its own loop and its own table (`mirrored`), so nothing the
 * assistant does — a slow Claude call, a failed batch — holds it up, and nothing
 * here changes what the assistant does.
 *
 * One direction only: writing in the group sends nothing to anyone.
 */
const POLL_MS = 5_000;
/** A message that keeps failing is reported in the group instead of retried forever. */
const MAX_ATTEMPTS = 4;

const attempts = new Map<string, number>();
let running = false;
const log = (...a: unknown[]) => console.log("[ourleads/mirror]", ...a);

export function startMirror(): void {
  if (!cloudConfigured()) return;
  const g = globalThis as unknown as { __ourleadsMirror?: NodeJS.Timeout };
  if (g.__ourleadsMirror) return;
  log(`started: cloning the business line into ${cloud().mirrorJid}`);
  g.__ourleadsMirror = setInterval(() => void tick(), POLL_MS);
  void tick();
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const d = getDb();
    const todo = d
      .prepare(
        `SELECT m.* FROM messages m
         LEFT JOIN mirrored x ON x.message_id = m.id AND x.chat_jid = m.chat_jid
         WHERE m.source = ? AND x.message_id IS NULL ORDER BY m.sent_at ASC LIMIT 20`,
      )
      .all(BUSINESS_SOURCE.id) as unknown as MessageRow[];
    const jid = cloud().mirrorJid;
    for (const m of todo) {
      const key = `${m.chat_jid}/${m.id}`;
      try {
        await copy(jid, m);
        done(m);
        attempts.delete(key);
      } catch (e) {
        const n = (attempts.get(key) ?? 0) + 1;
        attempts.set(key, n);
        log(`message ${m.id} not copied (attempt ${n}):`, (e as Error).message);
        if (n >= MAX_ATTEMPTS) {
          // Say so in the group rather than drop it silently; if even that fails, keep trying next tick.
          try {
            await sendText(jid, `${header(m)}\n⚠️ ההודעה לא הועתקה: ${(e as Error).message}`);
            done(m);
            attempts.delete(key);
          } catch {}
        }
        break; // keep the group in order: nothing after it goes before it
      }
    }
  } catch (e) {
    log("tick failed:", (e as Error).message);
  } finally {
    running = false;
  }
}

function done(m: MessageRow): void {
  getDb()
    .prepare("INSERT OR IGNORE INTO mirrored (message_id, chat_jid, mirrored_at) VALUES (?, ?, ?)")
    .run(m.id, m.chat_jid, new Date().toISOString());
}

/** "📥 דני כהן · 052-123-4567 · 10/10 13:40" — who wrote, on which customer's chat, when. */
function header(m: MessageRow): string {
  const phone = localPhone(waIdOf(m.chat_jid));
  const customer = (getDb()
    .prepare("SELECT written_by FROM messages WHERE chat_jid = ? AND from_me = 0 AND written_by IS NOT NULL ORDER BY sent_at DESC LIMIT 1")
    .get(m.chat_jid) as { written_by: string } | undefined)?.written_by;
  const chat = customer ? `${customer} · ${phone}` : phone;
  if (!m.from_me) return `📥 ${chat} · ${israelTime(m.sent_at)}`;
  const by = m.written_by === ASSISTANT.id ? ASSISTANT.name : (m.written_by ?? OWNER);
  return `📤 ${by} ← ${chat} · ${israelTime(m.sent_at)}`;
}

async function copy(jid: string, m: MessageRow): Promise<void> {
  const head = header(m);
  if (!m.media_type) {
    await sendText(jid, `${head}\n${m.content || "(הודעה ריקה)"}`);
    return;
  }
  const file = await mediaFile(m);
  if (m.media_type === "audio") {
    // A voice note carries no caption: the header (and the transcript, if there is one yet) goes first.
    await sendText(jid, `${head}\n🎤 הקלטה${m.transcript ? `: ${m.transcript}` : ""}${m.content ? `\n${m.content}` : ""}`);
    await sendMedia(jid, file, "");
    return;
  }
  await sendMedia(jid, file, m.content ? `${head}\n${m.content}` : head);
}

/** The message's media on disk — fetched from Meta here if the assistant has not fetched it yet. */
async function mediaFile(m: MessageRow): Promise<string> {
  const dir = path.join(dataDir(), "media");
  if (m.media_file) return path.join(dir, m.media_file);
  if (!m.media_ref) throw new Error(`${m.media_type} without a media id`);
  const name = await downloadCloudMedia(m.media_ref, dir);
  getDb().prepare("UPDATE messages SET media_file = ? WHERE id = ? AND chat_jid = ? AND media_file IS NULL").run(name, m.id, m.chat_jid);
  return path.join(dir, name);
}
