import "server-only";
import path from "node:path";
import { messagesSince, downloadMedia } from "./bridge";
import { SOURCES, Source, dataDir, ingestSince } from "./config";
import { askJson } from "./claude";
import { transcribe } from "./transcribe";
import {
  STATUSES,
  STATUS_LABELS,
  addEvent,
  getDb,
  getLead,
  isStatus,
  now,
  openLeads,
  updateLead,
  type LeadPatch,
  type MessageRow,
} from "./db";

/**
 * WhatsApp → leads.
 *
 * Every POLL_MS the source chats are read from the bridge and new messages are
 * stored as `pending`. A chat's pending messages are turned into leads only
 * once the chat has been QUIET for QUIET_MS: Dudu sends a lead as a burst —
 * a voice note, five photos, a video, an address, a phone number, a minute
 * apart — and reading it half-way would make two half-leads out of one.
 */
const POLL_MS = 20_000;
const QUIET_MS = 120_000;
const MAX_WAIT_MS = 8 * 60_000;
const RETRY_MS = 5 * 60_000;
/** Messages re-read before the newest one we have, so a late-arriving message
 *  with an older timestamp (the bridge was reconnecting) is still caught. */
const OVERLAP_MS = 30 * 60_000;

const OWNER = "יניב";

let running = false;
const backoffUntil = new Map<string, number>();
const log = (...a: unknown[]) => console.log("[ourleads/ingest]", ...a);

export function startIngest(): void {
  const g = globalThis as unknown as { __ourleadsIngest?: NodeJS.Timeout };
  if (g.__ourleadsIngest) return;
  log("started: polling", SOURCES.map((s) => s.label).join(", "));
  g.__ourleadsIngest = setInterval(() => void tick(), POLL_MS);
  void tick();
}

export async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await pull();
    for (const s of SOURCES) await processSource(s);
  } catch (e) {
    log("tick failed:", (e as Error).message);
  } finally {
    running = false;
  }
}

async function pull(): Promise<void> {
  const d = getDb();
  const latest = (d.prepare("SELECT MAX(sent_at) AS m FROM messages").get() as { m: string | null }).m;
  const floor = ingestSince();
  let since = floor;
  if (latest) {
    const back = new Date(new Date(latest).getTime() - OVERLAP_MS).toISOString();
    if (new Date(back) > new Date(floor)) since = back;
  }
  const msgs = await messagesSince(
    SOURCES.map((s) => s.jid),
    since,
  );
  const ins = d.prepare(
    `INSERT OR IGNORE INTO messages (id, chat_jid, source, from_me, sent_at, content, media_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  let added = 0;
  for (const m of msgs) {
    const src = SOURCES.find((s) => s.jid === m.chatJid);
    if (!src) continue;
    const r = ins.run(m.id, m.chatJid, src.id, m.fromMe ? 1 : 0, new Date(m.timestamp).toISOString(), m.content, m.mediaType);
    if (r.changes) added++;
  }
  if (added) log(`read ${added} new message(s)`);
}

async function processSource(src: Source): Promise<void> {
  if ((backoffUntil.get(src.id) ?? 0) > Date.now()) return;
  const d = getDb();
  const pending = d
    .prepare("SELECT * FROM messages WHERE source = ? AND state = 'pending' ORDER BY sent_at ASC")
    .all(src.id) as unknown as MessageRow[];
  if (!pending.length) return;
  const age = (m: MessageRow) => Date.now() - new Date(m.sent_at).getTime();
  // A chat in live conversation is never quiet for two minutes, so waiting for
  // quiet alone would hold a lead back for as long as the partners keep
  // talking. After MAX_WAIT_MS, everything older than QUIET_MS goes through.
  let batch = pending;
  if (age(pending[pending.length - 1]) < QUIET_MS) {
    if (age(pending[0]) < MAX_WAIT_MS) return;
    batch = pending.filter((m) => age(m) >= QUIET_MS);
  }
  const ready = batch;
  // Only Yaniv talking and nothing from the partner: still worth reading — "I'll
  // be there Thursday" is a status — so the batch goes through either way.
  try {
    await prepareMedia(ready);
    await extract(src, ready);
  } catch (e) {
    backoffUntil.set(src.id, Date.now() + RETRY_MS);
    log(`${src.id}: batch of ${ready.length} failed, retrying in 5 min:`, (e as Error).message);
  }
}

/** Download every pending message's media; transcribe voice notes. A failure
 *  is recorded on the message and does not stop the batch — a lead with one
 *  missing photo is better than no lead. */
async function prepareMedia(msgs: MessageRow[]): Promise<void> {
  const d = getDb();
  const dir = path.join(dataDir(), "media");
  for (const m of msgs) {
    if (!m.media_type) continue;
    try {
      if (!m.media_file) {
        const name = await downloadMedia(m.id, m.chat_jid, m.media_type, "", dir);
        m.media_file = name;
        d.prepare("UPDATE messages SET media_file = ? WHERE id = ? AND chat_jid = ?").run(name, m.id, m.chat_jid);
      }
      // Checked separately from the download: a server restart between the two
      // must not leave a voice note downloaded and never heard.
      if (m.media_type === "audio" && m.transcript == null) {
        const text = await transcribe(path.join(dir, m.media_file));
        m.transcript = text;
        d.prepare("UPDATE messages SET transcript = ? WHERE id = ? AND chat_jid = ?").run(text, m.id, m.chat_jid);
      }
    } catch (e) {
      m.error = (e as Error).message;
      d.prepare("UPDATE messages SET error = ? WHERE id = ? AND chat_jid = ?").run(m.error, m.id, m.chat_jid);
      log(`media for ${m.id} failed:`, m.error);
    }
  }
}

function israelTime(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function describeMessage(m: MessageRow, partner: string): string {
  const who = m.from_me ? OWNER : partner;
  const parts: string[] = [];
  if (m.media_type === "audio") parts.push(`[הקלטה קולית] תמלול: ${m.transcript ?? "(לא תומלל)"}`);
  else if (m.media_type === "image")
    parts.push(m.media_file ? `[תמונה: ${path.join(dataDir(), "media", m.media_file)}]` : "[תמונה שלא ירדה]");
  else if (m.media_type === "video") parts.push("[סרטון]");
  else if (m.media_type) parts.push(`[${m.media_type}]`);
  if (m.content) parts.push(m.content);
  return `<${m.id}> ${israelTime(m.sent_at)} ${who}: ${parts.join(" ") || "(ריק)"}`;
}

export function describeLeads(): string {
  const leads = openLeads();
  if (!leads.length) return "(אין לידים פתוחים)";
  return leads
    .map((l) => {
      const phones = (JSON.parse(l.phones) as string[]).join(", ");
      return `#${l.id} [${STATUS_LABELS[l.status]}] ${l.title}` +
        (l.customer_name ? ` | לקוח: ${l.customer_name}` : "") +
        (phones ? ` | טל: ${phones}` : "") +
        (l.address || l.city ? ` | ${[l.address, l.city].filter(Boolean).join(", ")}` : "") +
        (l.visit_at ? ` | ביקור: ${l.visit_at}` : "") +
        (l.next_step ? ` | הבא: ${l.next_step}` : "");
    })
    .join("\n");
}

export const STATUS_GUIDE = STATUSES.map((s) => `${s} = ${STATUS_LABELS[s]}`).join(", ");

interface LeadFields {
  title?: string;
  trade?: string | null;
  customerName?: string | null;
  phones?: string[];
  address?: string | null;
  city?: string | null;
  details?: string | null;
  nextStep?: string | null;
  visitAt?: string | null;
}

interface ExtractAnswer {
  create?: (LeadFields & { messageIds: string[]; status?: string; note?: string })[];
  attach?: (LeadFields & { leadId: number; messageIds: string[]; status?: string; note?: string })[];
  ignore?: string[];
}

function toPatch(f: LeadFields): LeadPatch {
  const p: LeadPatch = {};
  if (f.title) p.title = f.title;
  if (f.trade !== undefined) p.trade = f.trade;
  if (f.customerName !== undefined) p.customer_name = f.customerName;
  if (f.phones !== undefined) p.phones = f.phones;
  if (f.address !== undefined) p.address = f.address;
  if (f.city !== undefined) p.city = f.city;
  if (f.details !== undefined) p.details = f.details;
  if (f.nextStep !== undefined) p.next_step = f.nextStep;
  if (f.visitAt !== undefined) p.visit_at = f.visitAt;
  return p;
}

function buildPrompt(src: Source, msgs: MessageRow[]): string {
  return `אתה מנהל לוח לידים לשותפות עבודות גובה (סנפלינג). ${OWNER} הוא הקבלן שמבצע את העבודות.
השותף ${src.partner} מעביר לו לידים בוואטסאפ. התחומים של השותף הזה: ${src.trades}.

לפניך הודעות חדשות מהצ'אט בין ${OWNER} ל${src.partner}, והלידים שעדיין פתוחים.
המשימה: לשייך כל הודעה לליד — חדש או קיים — ולחלץ את פרטי הליד.

איך ליד נראה בצ'אט: השותף שולח רצף של כמה הודעות על אותו לקוח — הקלטה קולית, תמונות, סרטון,
כתובת, שם ומספר טלפון של הלקוח. הודעות סמוכות שמדברות על אותו לקוח/מקום הן ליד אחד.
תמונות וסרטונים בלי כיתוב שייכים לליד שההודעות שסביבם מדברות עליו.
תמונות: חובה לפתוח כל תמונה עם הכלי Read לפני שאתה עונה. רוב התמונות הן צילומי מסך של שיחת
וואטסאפ בין השותף ללקוח — יש בהן שם, מספר טלפון (בראש המסך), כתובת, מה הלקוח צריך ומה סוכם.
זה המקור העיקרי לפרטי הליד. תמונה אחרת היא צילום של המקום (גג, חזית) — שייך אותה לליד שלה.
מספר טלפון שנשלח לבד הוא טלפון של לקוח — אבל לא בהכרח של הליד הקודם: בדוק בהקלטות ובצילומי
המסך שסביבו למי הוא שייך. הקלטה של השותף שאומרת "תחזור למספר הזה, קוראים לה..." פותחת ליד חדש.
הודעה שמעדכנת ליד קיים (״אגיע אליו בחמישי״, ״הלקוח לא רלוונטי״, ״תעצור איתו עד שאעדכן״)
— שייך אותה לליד הקיים ועדכן סטטוס/צעד הבא. הודעות כלליות (שלום, חג שמח, תיאום על חלוקת עבודה,
שיחה שלא קשורה ללקוח מסוים) — ב-ignore.

סטטוסים אפשריים: ${STATUS_GUIDE}.
ליד חדש מתחיל ב-new אלא אם ההודעות כבר אומרות יותר (למשל ${OWNER} כתב שקבע ביקור → visit_scheduled).
״תתקדם הלאה, אל תתייחס אליו עד שאעדכן״ → on_hold.

שדות ליד:
- title: כותרת קצרה שתזהה את הליד ברשימה — עבודה + מקום, למשל "ניקוי גג – רעננה" או "איטום גג רעפים – באר שבע".
- trade: סוג העבודה במילים ספורות.
- customerName: שם הלקוח אם נאמר (לא שם השותף).
- phones: טלפונים של הלקוח בפורמט 05XXXXXXXX (בלי +972, בלי מקפים).
- address, city: כתובת ועיר אם נאמרו.
- details: סיכום של כל מה שידוע על העבודה — מה צריך, מצב, מחיר שדובר, דחיפות — כולל מה שנאמר בהקלטות. 1–4 משפטים.
- nextStep: מה הצעד הבא ומי עושה אותו, אם ברור.
- visitAt: מועד ביקור אם נקבע, בטקסט חופשי ("חמישי 09.10").

לליד קיים (attach) — שלח רק שדות שמשתנים או מתווספים. ב-details של ליד קיים שלח את הסיכום המלא המעודכן.
note: משפט קצר שמסביר מה השתנה (יוצג בהיסטוריה של הליד).

לידים פתוחים:
${describeLeads()}

הודעות חדשות (המזהה בסוגריים משולשים):
${msgs.map((m) => describeMessage(m, src.partner)).join("\n")}

התשובה במבנה הבא:
{"create":[{"messageIds":["..."],"title":"...","trade":"...","customerName":null,"phones":[],"address":null,"city":null,"details":"...","nextStep":null,"visitAt":null,"status":"new","note":null}],
 "attach":[{"leadId":1,"messageIds":["..."],"status":null,"note":"...", "details":"..."}],
 "ignore":["..."]}
כל מזהה הודעה מופיע בדיוק פעם אחת באחת הרשימות.`;
}

const str = { type: ["string", "null"] };
const LEAD_FIELDS = {
  title: { type: "string" },
  trade: str,
  customerName: str,
  phones: { type: "array", items: { type: "string" } },
  address: str,
  city: str,
  details: str,
  nextStep: str,
  visitAt: str,
  status: str,
  note: str,
  messageIds: { type: "array", items: { type: "string" } },
};
const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    create: { type: "array", items: { type: "object", properties: LEAD_FIELDS, required: ["title", "messageIds"] } },
    attach: {
      type: "array",
      items: { type: "object", properties: { leadId: { type: "integer" }, ...LEAD_FIELDS }, required: ["leadId", "messageIds"] },
    },
    ignore: { type: "array", items: { type: "string" } },
  },
  required: ["create", "attach", "ignore"],
};

async function extract(src: Source, msgs: MessageRow[]): Promise<void> {
  const answer = await askJson<ExtractAnswer>(buildPrompt(src, msgs), EXTRACT_SCHEMA, path.join(dataDir(), "media"));
  const d = getDb();
  const byId = new Map(msgs.map((m) => [m.id, m]));
  const setMsg = d.prepare("UPDATE messages SET lead_id = ?, state = ? WHERE id = ? AND chat_jid = ?");
  const touched = new Set<string>();
  const lastAt = (ids: string[]) =>
    ids.map((i) => byId.get(i)?.sent_at).filter(Boolean).sort().pop() ?? now();

  d.exec("BEGIN");
  try {
    for (const c of answer.create ?? []) {
      const ids = (c.messageIds ?? []).filter((i) => byId.has(i) && !touched.has(i));
      if (!ids.length || !c.title) continue;
      const t = now();
      const status = isStatus(c.status) ? c.status : "new";
      const r = d
        .prepare(
          `INSERT INTO leads (source, title, trade, customer_name, phones, address, city, details, status, next_step, visit_at, created_at, updated_at, last_message_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          src.id,
          c.title,
          c.trade ?? null,
          c.customerName ?? null,
          JSON.stringify(c.phones ?? []),
          c.address ?? null,
          c.city ?? null,
          c.details ?? null,
          status,
          c.nextStep ?? null,
          c.visitAt ?? null,
          t,
          t,
          lastAt(ids),
        );
      const leadId = Number(r.lastInsertRowid);
      // Dated by the partner's first message, not by when the server got round to reading it.
      const firstAt = ids.map((i) => byId.get(i)!.sent_at).sort()[0];
      addEvent(leadId, src.partner.split(" ")[0], "created", c.note ?? `ליד חדש מ${src.label}`, null, status, firstAt);
      for (const i of ids) {
        setMsg.run(leadId, "done", i, byId.get(i)!.chat_jid);
        touched.add(i);
      }
    }
    for (const a of answer.attach ?? []) {
      const ids = (a.messageIds ?? []).filter((i) => byId.has(i) && !touched.has(i));
      if (!ids.length || !getLead(a.leadId)) continue;
      const fromMe = ids.every((i) => byId.get(i)!.from_me);
      updateLead(
        a.leadId,
        fromMe ? OWNER : src.partner.split(" ")[0],
        toPatch(a),
        isStatus(a.status) ? a.status : null,
        a.note ?? "הודעות חדשות בוואטסאפ",
      );
      d.prepare("UPDATE leads SET last_message_at = ? WHERE id = ?").run(lastAt(ids), a.leadId);
      for (const i of ids) {
        setMsg.run(a.leadId, "done", i, byId.get(i)!.chat_jid);
        touched.add(i);
      }
    }
    // Anything the answer did not place — named in ignore or forgotten — is
    // closed as ignored, so it is not re-read forever. It stays visible on the
    // board's "unassigned" list, where a person can move it to a lead.
    for (const m of msgs) if (!touched.has(m.id)) setMsg.run(null, "ignored", m.id, m.chat_jid);
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  log(
    `${src.id}: ${msgs.length} message(s) → ${answer.create?.length ?? 0} new lead(s), ` +
      `${answer.attach?.length ?? 0} update(s), ${msgs.length - touched.size} unassigned`,
  );
}
