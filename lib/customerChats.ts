import "server-only";
import path from "node:path";
import { messagesInChats } from "./bridge";
import { SOURCES, TEXT_TARGETS, dataDir, ingestSince } from "./config";
import { askJson } from "./claude";
import { describeDeal, todayLine } from "./deal";
import { getDb, isStatus, type LeadRow, type MessageRow, updateLead } from "./db";
import { propose } from "./proposal";
import {
  OVERLAP_MS,
  OWNER,
  RETRY_MS,
  STATUS_GUIDE,
  type LeadFields,
  describeMessage,
  prepareMedia,
  readyBatch,
  toPatch,
} from "./ingest";

/**
 * The customer's own chat → his lead.
 *
 * A partner's chat says a lead exists; the conversation with the customer says
 * where it stands — "we already fixed it", "come Thursday", "send me a quote".
 * Until 2026-10-08 the board never read it, so a lead the customer had already
 * dropped sat on the board as open (lead #13: "כבר תיקנו את זה לפני כמה ימים").
 *
 * A customer's chat is found by the phone on his lead: a private chat whose
 * number is on a lead is that customer's. No phone, no chat — nothing is
 * guessed. Every message in it belongs to one of his leads (there is no
 * "unassigned" here: he is already known), so it shows on that lead's history,
 * with a line saying what happened. A status — and the meeting, working days
 * or price that come with it — is only PROPOSED (lib/proposal.ts): one of us
 * confirms it on the lead before it moves (Yaniv, 2026-10-08).
 *
 * It sees the bridge's account only — Yaniv's. Dudu's own talks with customers
 * are on his phone and never reach this.
 */
export const CUSTOMER_SOURCE = "customer";

/** How far before a lead appeared his chat is read the first time, so the
 *  talk that led to the lead (or right around it) is on it too. */
const LOOKBACK_MS = 3 * 24 * 60 * 60_000;
/** Earlier messages of the chat shown with a new batch, for context only. */
const CONTEXT_MESSAGES = 12;

const backoffUntil = new Map<string, number>();
type Log = (...a: unknown[]) => void;

export function phoneJid(phone: string): string | null {
  const digits = phone.replace(/\D/g, "").replace(/^972/, "0");
  if (!/^0\d{8,9}$/.test(digits)) return null;
  return `972${digits.slice(1)}@s.whatsapp.net`;
}

/** Each customer chat and the leads whose phone it is, newest lead first. */
export function customerChats(): Map<string, LeadRow[]> {
  const notCustomers = new Set<string>([...SOURCES.map((s) => s.jid), ...Object.values(TEXT_TARGETS).map((t) => t.jid)]);
  const leads = getDb().prepare("SELECT * FROM leads ORDER BY created_at DESC, id DESC").all() as unknown as LeadRow[];
  const chats = new Map<string, LeadRow[]>();
  for (const l of leads) {
    for (const p of JSON.parse(l.phones) as string[]) {
      const jid = phoneJid(p);
      if (!jid || notCustomers.has(jid)) continue;
      const list = chats.get(jid) ?? [];
      if (!list.some((x) => x.id === l.id)) list.push(l);
      chats.set(jid, list);
    }
  }
  return chats;
}

export async function pullCustomerChats(log: Log): Promise<void> {
  const d = getDb();
  const floor = new Date(ingestSince()).getTime();
  const latestIn = d.prepare("SELECT MAX(sent_at) AS m FROM messages WHERE chat_jid = ?");
  const wanted: { jid: string; since: string }[] = [];
  for (const [jid, leads] of customerChats()) {
    const latest = (latestIn.get(jid) as { m: string | null }).m;
    const first = Math.min(...leads.map((l) => new Date(l.created_at).getTime())) - LOOKBACK_MS;
    const since = latest ? new Date(latest).getTime() - OVERLAP_MS : first;
    wanted.push({ jid, since: new Date(Math.max(since, floor)).toISOString() });
  }
  const msgs = await messagesInChats(wanted);
  const ins = d.prepare(
    `INSERT OR IGNORE INTO messages (id, chat_jid, source, from_me, sent_at, content, media_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  let added = 0;
  for (const m of msgs) {
    const r = ins.run(m.id, m.chatJid, CUSTOMER_SOURCE, m.fromMe ? 1 : 0, new Date(m.timestamp).toISOString(), m.content, m.mediaType);
    if (r.changes) added++;
  }
  if (added) log(`read ${added} new customer message(s)`);
}

export async function processCustomerChats(log: Log): Promise<void> {
  const d = getDb();
  const chats = customerChats();
  const jids = (d.prepare("SELECT DISTINCT chat_jid AS j FROM messages WHERE source = ? AND state = 'pending'").all(CUSTOMER_SOURCE) as { j: string }[]).map((r) => r.j);
  for (const jid of jids) {
    if ((backoffUntil.get(jid) ?? 0) > Date.now()) continue;
    const leads = chats.get(jid);
    const pending = d
      .prepare("SELECT * FROM messages WHERE chat_jid = ? AND state = 'pending' ORDER BY sent_at ASC")
      .all(jid) as unknown as MessageRow[];
    // The phone came off every lead while these waited: they are no one's now.
    if (!leads?.length) {
      for (const m of pending) d.prepare("UPDATE messages SET state = 'ignored' WHERE id = ? AND chat_jid = ?").run(m.id, jid);
      continue;
    }
    const ready = readyBatch(pending);
    if (!ready) continue;
    try {
      await prepareMedia(ready);
      await extract(jid, leads, ready, log);
    } catch (e) {
      backoffUntil.set(jid, Date.now() + RETRY_MS);
      log(`customer ${jid}: batch of ${ready.length} failed, retrying in 5 min:`, (e as Error).message);
    }
  }
}

const customerName = (leads: LeadRow[]) => leads.find((l) => l.customer_name)?.customer_name ?? "הלקוח";

function describeLead(l: LeadRow): string {
  return (
    `#${l.id} [${l.status}] ${l.title}` +
    (l.details ? ` | ${l.details}` : "") +
    (l.next_step ? ` | הבא: ${l.next_step}` : "") +
    (l.meeting_at ? ` | פגישה: ${l.meeting_at}` : "") +
    (l.work_start ? ` | עבודה: ${l.work_start}${l.work_end && l.work_end !== l.work_start ? `–${l.work_end}` : ""}` : "") +
    (l.client_price != null ? ` | ${describeDeal(l)}` : "")
  );
}

function buildPrompt(leads: LeadRow[], context: MessageRow[], msgs: MessageRow[]): string {
  const name = customerName(leads);
  return `אתה מנהל לוח לידים לשותפות עבודות גובה (סנפלינג). ${OWNER} הוא הקבלן שמבצע את העבודות.
לפניך הודעות חדשות מהצ'אט הפרטי בין ${OWNER} ללקוח ${name}, והליד${leads.length > 1 ? "ים" : ""} שלו בלוח.
המשימה: לכתוב מה קרה בשיחה, ולהציע שינוי סטטוס אם השיחה מראה שהליד זז. ההצעה תחכה לאישור של אחד השותפים.

הליד${leads.length > 1 ? "ים" : ""} של הלקוח הזה:
${leads.map(describeLead).join("\n")}

סטטוסים: ${STATUS_GUIDE}.
- removed: הלקוח אומר שזה כבר לא רלוונטי — כבר תיקנו/סידרו, מצא מישהו אחר, ויתר, יקר לו מדי ולא ימשיך, ״לא צריך״.
- meeting: נקבע ביקור/פגישה אצל הלקוח (גם בלי תאריך). meetingAt = "YYYY-MM-DDTHH:MM" אם נאמר מועד; בלי שעה → 09:00 וכתוב ב-note שהשעה לא נקבעה.
- work: הלקוח אישר את העבודה/ההצעה. workStart/workEnd = "YYYY-MM-DD" אם נקבעו ימי עבודה.
- ליד שהיה removed והלקוח חוזר ורוצה את העבודה — status none (או meeting/work לפי מה שנאמר).
- כל השאר (שאלה, ״אחשוב על זה״, שלח תמונות, ביקש הצעה) — בלי status, רק note.
${todayLine()}
עסקה: clientPrice/clientVat רק כשסוכם סכום עם הלקוח (true = פלוס מע"מ, false = כולל). הצעה שעוד לא אושרה — ב-note ובפירוט.
details: רק אם נוסף מידע ממשי על העבודה — הסיכום המלא המעודכן של הליד, 1–4 משפטים. אחרת השאר null.
nextStep: הצעד הבא ומי עושה אותו, אם השתנה.
note: משפט קצר בעברית שמסביר מה קרה בשיחה (יוצג בהיסטוריה של הליד). null אם אין שום דבר חדש — ברכה, ״תודה״, ״אוקי״, אימוג׳י.
${leads.length > 1 ? "יש ללקוח כמה לידים: שייך כל הודעה לליד שהיא מדברת עליו. הודעה כללית — לליד העדכני ביותר (הראשון ברשימה).\n" : ""}תמונות: פתח כל תמונה עם הכלי Read לפני שאתה עונה.

${context.length ? `הודעות קודמות בשיחה (רק להקשר, כבר טופלו):\n${context.map((m) => describeMessage(m, name)).join("\n")}\n\n` : ""}הודעות חדשות (המזהה בסוגריים משולשים):
${msgs.map((m) => describeMessage(m, name)).join("\n")}

התשובה: {"updates":[{"leadId":${leads[0].id},"messageIds":["..."],"status":null,"note":null,"details":null,"nextStep":null,"meetingAt":null,"workStart":null,"workEnd":null,"clientPrice":null,"clientVat":null}]}
עדכון אחד לכל ליד שיש עליו הודעות. כל מזהה הודעה מופיע פעם אחת.`;
}

const str = { type: ["string", "null"] };
const SCHEMA = {
  type: "object",
  properties: {
    updates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          leadId: { type: "integer" },
          messageIds: { type: "array", items: { type: "string" } },
          status: str,
          note: str,
          details: str,
          nextStep: str,
          meetingAt: str,
          workStart: str,
          workEnd: str,
          clientPrice: { type: ["number", "null"] },
          clientVat: { type: ["boolean", "null"] },
        },
        required: ["leadId", "messageIds"],
      },
    },
  },
  required: ["updates"],
};

interface Answer {
  updates?: (LeadFields & { leadId: number; messageIds: string[]; status?: string | null; note?: string | null })[];
}

async function extract(jid: string, leads: LeadRow[], msgs: MessageRow[], log: Log): Promise<void> {
  const d = getDb();
  const context = (
    d
      .prepare("SELECT * FROM messages WHERE chat_jid = ? AND state != 'pending' ORDER BY sent_at DESC LIMIT ?")
      .all(jid, CONTEXT_MESSAGES) as unknown as MessageRow[]
  ).reverse();
  const answer = await askJson<Answer>(buildPrompt(leads, context, msgs), SCHEMA, path.join(dataDir(), "media"));
  const name = customerName(leads);
  const mine = new Set(leads.map((l) => l.id));
  const byId = new Map(msgs.map((m) => [m.id, m]));
  const setMsg = d.prepare("UPDATE messages SET lead_id = ?, state = 'done' WHERE id = ? AND chat_jid = ?");
  const touched = new Set<string>();
  let noted = 0;
  let proposed = 0;

  d.exec("BEGIN");
  try {
    for (const u of answer.updates ?? []) {
      if (!mine.has(u.leadId)) continue;
      const ids = (u.messageIds ?? []).filter((i) => byId.has(i) && !touched.has(i));
      if (!ids.length) continue;
      // Signed by whoever moved it: the customer's word, or Yaniv's own in the chat.
      const fromMe = ids.every((i) => byId.get(i)!.from_me);
      const who = fromMe ? OWNER : name;
      // What he said, and what is now known about the job, goes straight on the lead.
      const info = toPatch({ details: u.details ?? undefined, nextStep: u.nextStep ?? undefined });
      const last = ids.map((i) => byId.get(i)!.sent_at).sort().pop()!;
      if (u.note || Object.keys(info).length) {
        updateLead(u.leadId, who, info, null, u.note ?? null);
        noted++;
      }
      // Where the lead stands only moves when one of us confirms it.
      const move = toPatch({ meetingAt: u.meetingAt, workStart: u.workStart, workEnd: u.workEnd, clientPrice: u.clientPrice, clientVat: u.clientVat });
      const status = isStatus(u.status) ? u.status : null;
      if ((status || Object.keys(move).length) && propose(u.leadId, { status, patch: move, why: u.note ?? "הודעה מהלקוח בוואטסאפ", who }, last))
        proposed++;
      d.prepare("UPDATE leads SET last_message_at = MAX(COALESCE(last_message_at, ''), ?) WHERE id = ?").run(last, u.leadId);
      for (const i of ids) {
        setMsg.run(u.leadId, i, jid);
        touched.add(i);
      }
    }
    // He is known, so nothing in his chat is "unassigned": what the answer left
    // out still goes on his newest lead's thread, just without an event.
    for (const m of msgs) if (!touched.has(m.id)) setMsg.run(leads[0].id, m.id, jid);
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  log(`customer ${name} (${jid}): ${msgs.length} message(s) → ${noted} history line(s), ${proposed} status proposal(s)`);
}
