import "server-only";
import path from "node:path";
import { askJson } from "./claude";
import { sendText } from "./bridge";
import { CARD_ORIGIN, dataDir } from "./config";
import {
  BUSINESS_SUFFIX,
  businessJid,
  cloud,
  cloudConfigured,
  downloadCloudMedia,
  isBusinessJid,
  isLine,
  localPhone,
  messageParts,
  sendCloudText,
  waIdOf,
  type Incoming,
} from "./cloud";
import { addEvent, getDb, getLead, now, updateLead, type LeadRow, type MessageRow } from "./db";
import { OWNER, israelTime, toPatch, type LeadFields } from "./ingest";
import { todayLine } from "./deal";
import { transcribe } from "./transcribe";

/**
 * The business line's customers → leads, and the assistant that answers them
 * while Yaniv is busy (2026-10-09).
 *
 * It replaces the partner's part of the work: the first talk with a customer
 * and collecting what the job is. Its rules are Yaniv's:
 * - Customers expect a person. So it only speaks in BUSY mode, which he
 *   switches by hand and which stays until he switches it back (no timer — his
 *   call). When it speaks it says it is his assistant; it never poses as him.
 * - Someone who is not a customer (a friend, a supplier, spam) gets nothing:
 *   no reply, no lead, no flag.
 * - It never names a price, an estimate or a date. A price is Yaniv's word, so
 *   it goes out only when he writes it himself; a reply that slipped one in is
 *   held back (`hasPrice`) and left on the lead for him.
 */
export const BUSINESS_SOURCE = { id: "business", label: "העסק", actor: "לקוח" } as const;

/** The assistant's name on the timeline and in the chat's history. */
export const ASSISTANT = "assistant";
const ASSISTANT_LABEL = "העוזר";

/** A customer writes in bursts too — a photo, then the address — but a person is waiting, so the wait is short. */
const QUIET_MS = 40_000;
const MAX_WAIT_MS = 3 * 60_000;
const RETRY_MS = 3 * 60_000;
const CONTEXT_MESSAGES = 30;
/** Meta's customer-service window: free-form text is accepted until 24 h after his last message. */
const WINDOW_MS = 24 * 60 * 60_000;

type Log = (...a: unknown[]) => void;
const backoffUntil = new Map<string, number>();

// ── Busy mode ─────────────────────────────────────────────────────────────────

export interface BusyState {
  busy: boolean;
  at: string | null;
  by: string | null;
}

export function busyState(): BusyState {
  const r = getDb().prepare("SELECT value, updated_at, updated_by FROM settings WHERE key = 'assistant_busy'").get() as
    | { value: string; updated_at: string; updated_by: string }
    | undefined;
  return r ? { busy: r.value === "on", at: r.updated_at, by: r.updated_by } : { busy: false, at: null, by: null };
}

export function setBusy(busy: boolean, who: string): BusyState {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('assistant_busy', ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .run(busy ? "on" : "off", now(), who);
  return busyState();
}

// ── Incoming (the webhook) ────────────────────────────────────────────────────

/** Store what Meta posted. Meta re-posts what it thinks went unanswered, so a message is stored once. */
export function storeIncoming(items: Incoming[]): number {
  const ins = getDb().prepare(
    `INSERT OR IGNORE INTO messages (id, chat_jid, source, from_me, sent_at, content, media_type, media_ref, written_by)
     VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`,
  );
  let added = 0;
  for (const { message: m, profileName } of items) {
    const p = messageParts(m);
    const sentAt = new Date(Number(m.timestamp) * 1000 || Date.now()).toISOString();
    if (ins.run(m.id, businessJid(m.from), BUSINESS_SOURCE.id, sentAt, p.content, p.mediaType, p.mediaRef, profileName).changes) added++;
  }
  return added;
}

// ── Reading the chats ─────────────────────────────────────────────────────────

function readyBatch(pending: MessageRow[]): MessageRow[] | null {
  const age = (m: MessageRow) => Date.now() - new Date(m.sent_at).getTime();
  if (age(pending[pending.length - 1]) >= QUIET_MS) return pending;
  if (age(pending[0]) < MAX_WAIT_MS) return null;
  return pending.filter((m) => age(m) >= QUIET_MS);
}

export async function processBusinessChats(log: Log): Promise<void> {
  if (!cloudConfigured()) return;
  const d = getDb();
  const jids = (
    d.prepare("SELECT DISTINCT chat_jid AS j FROM messages WHERE source = ? AND state = 'pending'").all(BUSINESS_SOURCE.id) as { j: string }[]
  ).map((r) => r.j);
  for (const jid of jids) {
    if ((backoffUntil.get(jid) ?? 0) > Date.now()) continue;
    const pending = d.prepare("SELECT * FROM messages WHERE chat_jid = ? AND state = 'pending' ORDER BY sent_at ASC").all(jid) as unknown as MessageRow[];
    const ready = readyBatch(pending);
    if (!ready) continue;
    try {
      await fetchMedia(ready, log);
      await handle(jid, ready, log);
    } catch (e) {
      backoffUntil.set(jid, Date.now() + RETRY_MS);
      log(`business ${jid}: batch of ${ready.length} failed, retrying in 3 min:`, (e as Error).message);
    }
  }
}

async function fetchMedia(msgs: MessageRow[], log: Log): Promise<void> {
  const d = getDb();
  const dir = path.join(dataDir(), "media");
  for (const m of msgs) {
    if (!m.media_type || !m.media_ref) continue;
    try {
      if (!m.media_file) {
        m.media_file = await downloadCloudMedia(m.media_ref, dir);
        d.prepare("UPDATE messages SET media_file = ? WHERE id = ? AND chat_jid = ?").run(m.media_file, m.id, m.chat_jid);
      }
      if (m.media_type === "audio" && m.transcript == null) {
        m.transcript = await transcribe(path.join(dir, m.media_file));
        d.prepare("UPDATE messages SET transcript = ? WHERE id = ? AND chat_jid = ?").run(m.transcript, m.id, m.chat_jid);
      }
    } catch (e) {
      m.error = (e as Error).message;
      d.prepare("UPDATE messages SET error = ? WHERE id = ? AND chat_jid = ?").run(m.error, m.id, m.chat_jid);
      log(`business media ${m.id} failed:`, m.error);
    }
  }
}

/** His open lead: the newest one carrying his phone that is not removed. */
function leadFor(jid: string): LeadRow | undefined {
  const phone = localPhone(waIdOf(jid));
  const leads = getDb().prepare("SELECT * FROM leads WHERE status != 'removed' ORDER BY created_at DESC, id DESC").all() as unknown as LeadRow[];
  return leads.find((l) => (JSON.parse(l.phones) as string[]).some((p) => p.replace(/\D/g, "").replace(/^972/, "0") === phone));
}

function who(m: MessageRow, customer: string): string {
  if (!m.from_me) return customer;
  return m.written_by === ASSISTANT ? ASSISTANT_LABEL : (m.written_by ?? OWNER);
}

function describe(m: MessageRow, customer: string): string {
  const parts: string[] = [];
  if (m.media_type === "audio") parts.push(`[הקלטה קולית] תמלול: ${m.transcript ?? "(לא תומלל)"}`);
  else if (m.media_type === "image") parts.push(m.media_file ? `[תמונה: ${path.join(dataDir(), "media", m.media_file)}]` : "[תמונה שלא ירדה]");
  else if (m.media_type === "video") parts.push("[סרטון]");
  else if (m.media_type) parts.push(`[${m.media_type}]`);
  if (m.content) parts.push(m.content);
  return `<${m.id}> ${israelTime(m.sent_at)} ${who(m, customer)}: ${parts.join(" ") || "(ריק)"}`;
}

const PRICE = /₪|ש["״']?ח|שקל|מע["״']?מ|\d[\d,.]*\s*(?:אלף|k\b)/i;
/** A reply that names money is Yaniv's to send, not the assistant's. */
export function hasPrice(text: string): boolean {
  return PRICE.test(text);
}

function buildPrompt(lead: LeadRow | undefined, history: MessageRow[], fresh: MessageRow[], customer: string, busy: boolean): string {
  const spokeBefore = history.some((m) => m.from_me && m.written_by === ASSISTANT && Date.now() - new Date(m.sent_at).getTime() < 12 * 60 * 60_000);
  return `אתה העוזר של ${OWNER}, קבלן עבודות גובה (סנפלינג): איטום, שיקום בטון, ניקוי חזיתות וחלונות בגובה, רשתות והרחקת יונים, פירוק אנטנות ועוד.
זה הקו העסקי שלו בוואטסאפ. כותבים אליו לקוחות מהאתר ומהמודעות.
${todayLine()}

המשימה בשלושה חלקים:
1. customer: האם הכותב הוא לקוח (או לקוח אפשרי) שמבקש עבודה או שואל עליה?
   "yes" — כן. "no" — בטוח שלא: חבר, ספק, מוכר שמציע משהו, ספאם, הודעה אוטומטית. "unsure" — אי אפשר לדעת עדיין (למשל רק "היי").
2. lead: אם customer = "yes" — פרטי הליד מכל השיחה. השאר null בכל שדה שלא נאמר.
   title: עבודה + מקום, קצר ("איטום גג – באר שבע"; מקום לא ידוע → "מקום לא ידוע").
   trade, customerName (שם הלקוח אם אמר; אחרת null), address, city,
   details: כל מה שידוע על העבודה, 1–4 משפטים. nextStep: מה צריך לקרות עכשיו ומי עושה.
   note: משפט קצר להיסטוריה של הליד על מה שקרה בהודעות החדשות, או null אם אין בהן כלום חדש.
   תמונות: פתח כל תמונה עם הכלי Read לפני שאתה עונה.
   line: "pigeons_windows" — הרחקת יונים, רשתות יונים, ניקוי לשלשת, ניקוי חלונות/זכוכית/מעקות/גגות זכוכית;
   "building" — כל השאר (איטום, שיקום בטון, חזיתות, צביעה, אנטנות, מרזבים...). לא ברור עדיין — "building".
3. reply: ${
    busy
      ? `${OWNER} באמצע עבודה בגובה ולא יכול לענות. אתה עונה ללקוח במקומו — רק אם customer הוא "yes" או "unsure". אחרת reply = null.
   ${spokeBefore ? "כבר הצגת את עצמך בשיחה הזאת — אל תציג שוב." : `זו הפעם הראשונה שאתה כותב בשיחה: פתח בכך שאתה העוזר של ${OWNER}, ש${OWNER} באמצע עבודה בגובה ויחזור אליו כשירד.`}
   כתוב בעברית, קצר וחם, כמו אדם — 1–3 משפטים, בלי רשימות ובלי סימני קריאה מרובים.
   המטרה: לאסוף מה שחסר כדי ש${OWNER} יוכל לתמחר: מה העבודה, כתובת או עיר, תמונות של המקום, באיזו קומה/גובה, כמה דחוף, ושם.
   שאל רק על מה שעוד חסר, לכל היותר שני דברים בהודעה. אם כבר יש הכל — תודה, ו${OWNER} יחזור אליו עם הצעה.
   אסור: מחיר, הערכת מחיר, טווח מחירים, מועד או תאריך לעבודה, הבטחה כלשהי. אם שואלים על מחיר — ${OWNER} ייתן הצעה אחרי שיראה את הפרטים.
   אסור להציג את עצמך כ${OWNER}. אם שואלים — אתה העוזר שלו.
   אם ההודעה החדשה לא דורשת תשובה (״תודה״, ״אוקי״, אימוג׳י) — reply = null.`
      : `${OWNER} זמין ועונה בעצמו. reply = null תמיד.`
  }

${lead ? `הליד הקיים של הכותב בלוח: #${lead.id} ${lead.title}${lead.details ? ` | ${lead.details}` : ""}${lead.customer_name ? ` | לקוח: ${lead.customer_name}` : ""}${lead.address || lead.city ? ` | ${[lead.address, lead.city].filter(Boolean).join(", ")}` : ""}\n` : ""}${history.length ? `השיחה עד עכשיו (כבר טופלה):\n${history.map((m) => describe(m, customer)).join("\n")}\n\n` : ""}הודעות חדשות:
${fresh.map((m) => describe(m, customer)).join("\n")}`;
}

const str = { type: ["string", "null"] };
const SCHEMA = {
  type: "object",
  properties: {
    customer: { type: "string", enum: ["yes", "no", "unsure"] },
    lead: {
      type: ["object", "null"],
      properties: { title: str, trade: str, customerName: str, address: str, city: str, details: str, nextStep: str },
    },
    note: str,
    reply: str,
    line: { type: "string", enum: ["pigeons_windows", "building"] },
  },
  required: ["customer", "lead", "note", "reply", "line"],
};

interface Answer {
  customer: "yes" | "no" | "unsure";
  lead: (LeadFields & { title?: string | null }) | null;
  note: string | null;
  reply: string | null;
  line: string;
}

async function handle(jid: string, fresh: MessageRow[], log: Log): Promise<void> {
  const d = getDb();
  const lead = leadFor(jid);
  const history = (
    d.prepare("SELECT * FROM messages WHERE chat_jid = ? AND state != 'pending' ORDER BY sent_at DESC LIMIT ?").all(jid, CONTEXT_MESSAGES) as unknown as MessageRow[]
  ).reverse();
  const profile = [...fresh, ...history].reverse().find((m) => !m.from_me && m.written_by)?.written_by ?? null;
  const customer = lead?.customer_name ?? profile ?? "הלקוח";
  const { busy } = busyState();
  const a = await askJson<Answer>(buildPrompt(lead, history, fresh, customer, busy), SCHEMA, path.join(dataDir(), "media"));
  const setState = d.prepare("UPDATE messages SET lead_id = ?, state = ? WHERE id = ? AND chat_jid = ?");

  // Not a customer: nothing at all — no reply, no lead, no flag (Yaniv, 2026-10-09).
  if (a.customer === "no" && !lead) {
    for (const m of fresh) setState.run(null, "ignored", m.id, jid);
    log(`business ${jid}: not a customer, ${fresh.length} message(s) left alone`);
    return;
  }

  let leadId = lead?.id ?? null;
  const last = fresh[fresh.length - 1].sent_at;
  if (a.customer === "yes" || lead) {
    const f = a.lead ?? {};
    const phone = localPhone(waIdOf(jid));
    d.exec("BEGIN");
    try {
      if (!leadId) {
        const t = now();
        const r = d
          .prepare(
            `INSERT INTO leads (source, title, trade, customer_name, phones, address, city, details, status, next_step, created_at, updated_at, last_message_at, line)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'none', ?, ?, ?, ?, ?)`,
          )
          .run(BUSINESS_SOURCE.id, f.title || "פנייה חדשה", f.trade ?? null, f.customerName ?? profile, JSON.stringify([phone]), f.address ?? null, f.city ?? null, f.details ?? null, f.nextStep ?? null, t, t, last, isLine(a.line) ? a.line : "building");
        leadId = Number(r.lastInsertRowid);
        addEvent(leadId, customer, "created", a.note ?? "פנייה חדשה בקו העסקי", null, "none", fresh[0].sent_at);
        // What he wrote before we knew he was a customer ("היי" → "unsure") belongs on his lead too.
        d.prepare("UPDATE messages SET lead_id = ? WHERE chat_jid = ? AND lead_id IS NULL AND state = 'done'").run(leadId, jid);
      } else {
        // Only fill what is new: the title is never swapped for another job.
        const patch = toPatch({ ...f, title: lead!.title.includes("לא ידוע") || lead!.title === "פנייה חדשה" ? (f.title ?? undefined) : undefined });
        for (const k of Object.keys(patch) as (keyof typeof patch)[]) if (patch[k] == null) delete patch[k];
        if (a.note || Object.keys(patch).length) updateLead(leadId, customer, patch, null, a.note);
      }
      d.prepare("UPDATE leads SET last_message_at = MAX(COALESCE(last_message_at, ''), ?) WHERE id = ?").run(last, leadId);
      // A first guess ("building" because it was not clear yet) is corrected once the job is known.
      if (isLine(a.line)) d.prepare("UPDATE leads SET line = ? WHERE id = ? AND source = ?").run(a.line, leadId, BUSINESS_SOURCE.id);
      for (const m of fresh) setState.run(leadId, "done", m.id, jid);
      d.exec("COMMIT");
    } catch (e) {
      d.exec("ROLLBACK");
      throw e;
    }
  } else {
    for (const m of fresh) setState.run(null, "done", m.id, jid);
  }

  // Answer only in busy mode, and only within the window his message opened.
  const reply = a.reply?.trim();
  if (busy && reply && a.customer !== "no") {
    if (hasPrice(reply)) {
      if (leadId) addEvent(leadId, ASSISTANT_LABEL, "note", `לא נשלח ללקוח כי הזכיר מחיר: ״${reply}״`);
      log(`business ${jid}: reply held back (names a price)`);
    } else {
      // The lead is already saved; a failed send must not undo it, and must not pass silently either.
      try {
        await sendAndStore(jid, reply, ASSISTANT, leadId);
        log(`business ${jid}: assistant answered`);
      } catch (e) {
        if (leadId) addEvent(leadId, ASSISTANT_LABEL, "note", `התשובה ללקוח לא נשלחה (${(e as Error).message}): ״${reply}״`);
        log(`business ${jid}: reply failed:`, (e as Error).message);
      }
    }
  }

  if (leadId) await alertOwner(leadId, !lead, fresh.length, log);
}

/** Send on the business line and keep it in the chat's history. */
async function sendAndStore(jid: string, text: string, writtenBy: string, leadId: number | null): Promise<void> {
  const id = await sendCloudText(waIdOf(jid), text);
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO messages (id, chat_jid, source, from_me, sent_at, content, media_type, lead_id, state, written_by)
       VALUES (?, ?, ?, 1, ?, ?, '', ?, 'done', ?)`,
    )
    .run(id, jid, BUSINESS_SOURCE.id, now(), text, leadId, writtenBy);
}

/**
 * The business line has no phone to ring, so Yaniv hears about a customer
 * through his own WhatsApp: one line per batch, to the group for the lead's kind of
 * work (`alertJids` in the Cloud API config) — groups on his personal number that only
 * he is in, sent through the personal bridge.
 */
async function alertOwner(leadId: number, isNew: boolean, count: number, log: Log): Promise<void> {
  const lead = getLead(leadId)!;
  const cfg = cloud();
  const { busy } = busyState();
  const text =
    `${isNew ? "🆕 פנייה חדשה" : `💬 ${count} הודעות חדשות`} בקו העסקי — ${lead.customer_name ?? "לקוח"}: ${lead.title}` +
    `${busy ? "\nהעוזר עונה לו (מצב עסוק)." : "\nאתה במצב זמין — הלקוח מחכה לתשובה שלך."}` +
    `\n${CARD_ORIGIN}/?lead=${leadId}`;
  try {
    await sendText(cfg.alertJids[isLine(lead.line) ? lead.line : "building"], text);
  } catch (e) {
    log(`business alert for lead #${leadId} failed:`, (e as Error).message);
  }
}

// ── Yaniv answering by hand ───────────────────────────────────────────────────

/** The business chat a lead's customer writes from, if he ever wrote on the business line. */
export function businessChatOf(leadId: number): string | null {
  const r = getDb()
    .prepare("SELECT chat_jid FROM messages WHERE lead_id = ? AND chat_jid LIKE ? ORDER BY sent_at DESC LIMIT 1")
    .get(leadId, `%${BUSINESS_SUFFIX}`) as { chat_jid: string } | undefined;
  return r && isBusinessJid(r.chat_jid) ? r.chat_jid : null;
}

/** When the customer last wrote — Meta accepts free text until 24 h after it. */
export function windowOpenUntil(jid: string): string | null {
  const r = getDb().prepare("SELECT MAX(sent_at) AS m FROM messages WHERE chat_jid = ? AND from_me = 0").get(jid) as { m: string | null };
  return r.m ? new Date(new Date(r.m).getTime() + WINDOW_MS).toISOString() : null;
}

export async function replyByHand(leadId: number, text: string, writer: string): Promise<void> {
  const body = text.trim();
  if (!body) throw new Error("ההודעה ריקה");
  const jid = businessChatOf(leadId);
  if (!jid) throw new Error("הלקוח הזה לא כתב בקו העסקי, אין לאן לענות");
  const until = windowOpenUntil(jid);
  if (!until || until < now())
    throw new Error("עברו 24 שעות מההודעה האחרונה של הלקוח. וואטסאפ מאפשר עכשיו רק הודעת תבנית מאושרת");
  await sendAndStore(jid, body, writer, leadId);
}
