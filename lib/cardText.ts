import "server-only";
import { createHash } from "node:crypto";
import { sendText } from "./bridge";
import { CUSTOMER, TEXT_TARGETS, users, type TextTarget } from "./config";
import { money, sayWhen } from "./deal";
import { CLOSED, addEvent, customerDue, getDb, israelToday, now, type LeadRow } from "./db";
import { leadCard, type Hideable, type LeadCard, HIDE_LABELS, effectiveHide } from "./shares";

/**
 * Leads as plain WhatsApp text — for Dudu, who reads what is in the chat and
 * does not open links on his phone. Two shapes:
 *
 * - **a card**: one lead, everything its link page holds minus the photos, with
 *   the same fields hidden the same way;
 * - **the report**: every open lead, short, grouped by whose move it is.
 *
 * Either goes to a `TEXT_TARGETS` chat: the preview group first, Dudu once it
 * reads right (sent from the app, or forwarded by hand from the group).
 *
 * Text that reaches a partner chat is read back by the ingest, where the names,
 * phones and addresses in it would be extracted as new leads. So every message
 * ends with a mark (`ourLeads · ליד #9` / `ourLeads · דוח לידים`), each send is
 * recorded in `sent_texts`, and `claimSentText` files such a message instead of
 * extracting it.
 */

const CARD_MARK = (id: number) => `ourLeads · ליד #${id}`;
const REPORT_MARK = "ourLeads · דוח לידים";
const MARK_IN_TEXT = /ourLeads · (?:ליד #(\d+)|דוח לידים)/;

/** How long one history line may be — the card is read on a phone, in a chat. */
const LINE_MAX = 280;
/** The newest history lines kept; the rest is on the board. */
const HISTORY_MAX = 12;
/** A lead's details in the report — the report is a list to scan, the card has the rest. */
const REPORT_DETAILS_MAX = 220;
/**
 * The report is split into messages of at most this many characters, at lead
 * boundaries. WhatsApp takes 65k, but folds a long one behind "קרא עוד" and a
 * wall of text is hard to answer about; a few screens per message is readable.
 */
const PART_MAX = 5000;

const clip = (t: string, max = LINE_MAX) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

/** "9.10 14:30" in Israel time, from an ISO instant. */
function at(iso: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}.${p.month} ${p.hour}:${p.minute}`;
}

function holderName(id: string): string {
  return users().find((u) => u.id === id)?.name ?? id;
}

function ball(holder: string | null, checkBackAt: string | null): string | null {
  if (!holder) return null;
  if (holder === CUSTOMER.id) return `אצל ${CUSTOMER.name}${checkBackAt ? ` — חוזרים אליו ב${sayWhen(checkBackAt)}` : ""}`;
  return `אצל ${holderName(holder)}`;
}

const vatFlag = (v: boolean | null) => (v === null ? null : v ? 1 : 0);

/** The lines both shapes share: who, where, when, how much. */
function facts(c: Pick<LeadCard, "customerName" | "phones" | "address" | "city" | "meetingAt" | "workStart" | "workEnd" | "deal">): string[] {
  const out: string[] = [];
  if (c.customerName) out.push(`👤 ${c.customerName}`);
  if (c.phones.length) out.push(`📞 ${c.phones.join(", ")}`);
  const where = [c.address, c.address && c.city && c.address.includes(c.city) ? null : c.city].filter(Boolean).join(", ");
  if (where) out.push(`📍 ${where}`);
  if (c.meetingAt) out.push(`📅 פגישה ${sayWhen(c.meetingAt)}`);
  if (c.workStart) out.push(`🛠 עבודה ${sayWhen(c.workStart)}${c.workEnd && c.workEnd !== c.workStart ? ` עד ${sayWhen(c.workEnd)}` : ""}`);
  if (c.deal) {
    const client = money(c.deal.clientPrice, vatFlag(c.deal.clientVat));
    if (client) out.push(`💰 מול הלקוח ${client}`);
    const sub = money(c.deal.subPrice, vatFlag(c.deal.subVat));
    const subWho = [c.deal.subName, c.deal.subPhone].filter(Boolean).join(" ");
    if (sub || subWho) out.push(`🤝 קבלן משנה${subWho ? ` ${subWho}` : ""}${sub ? ` ${sub}` : ""}`);
  }
  return out;
}

export function cardText(leadId: number, c: LeadCard): string {
  const out: string[] = [`*${c.title}*`, [c.sourceLabel, c.status === "none" ? null : c.statusLabel, c.trade].filter(Boolean).join(" · ")];
  const b = ball(c.holder, c.checkBackAt);
  if (b) out.push(`🏀 ${b}`);
  out.push("", ...facts(c));

  if (c.details) out.push("", "*פרטים*", c.details);
  if (c.nextStep) out.push("", `*הצעד הבא:* ${c.nextStep}`);

  const lines = c.timeline.flatMap((t) => {
    if (t.kind === "msg") {
      const text = (t.m.transcript ?? t.m.content).trim();
      if (!text) return [];
      return [`• ${at(t.at)} ${t.m.fromMe ? "יניב" : c.partner}${t.m.transcript ? " 🎤" : ""}: ${clip(text)}`];
    }
    const move = t.e.from && t.e.to ? ` (${t.e.from} ← ${t.e.to})` : "";
    return [`• ${at(t.at)} ${t.e.who}: ${clip(t.e.text ?? "")}${move}`];
  });
  if (lines.length) {
    out.push("", "*היסטוריה*");
    if (lines.length > HISTORY_MAX) out.push(`(${lines.length - HISTORY_MAX} מוקדמות יותר בכרטיס)`);
    out.push(...lines.slice(-HISTORY_MAX));
  }

  if (c.photos.length) out.push("", `📷 ${c.photos.length} תמונות בכרטיס`);
  out.push("", `_${CARD_MARK(leadId)}_`);
  return out.join("\n");
}

/** Every open lead, oldest first within its group — the one waiting longest is read first. */
function reportLeads(): LeadRow[] {
  return getDb()
    .prepare(`SELECT * FROM leads WHERE status NOT IN (${CLOSED.map(() => "?").join(",")}) ORDER BY created_at ASC`)
    .all(...CLOSED) as unknown as LeadRow[];
}

/**
 * The report: every open lead, grouped by whose move it is — each partner, then
 * the customer (those due today first), then nobody yet — split into messages of
 * at most `PART_MAX` characters at lead boundaries. Returns the messages and the
 * leads in them.
 */
export function reportText(): { parts: string[]; leadIds: number[] } {
  const leads = reportLeads();
  const groups: { title: string; leads: LeadRow[] }[] = [
    ...users().map((u) => ({ title: `אצל ${u.name}`, leads: leads.filter((l) => l.holder === u.id) })),
    {
      title: `אצל ${CUSTOMER.name}`,
      leads: leads
        .filter((l) => l.holder === CUSTOMER.id)
        .sort((a, b) => Number(customerDue(b)) - Number(customerDue(a)) || (a.check_back_at ?? "").localeCompare(b.check_back_at ?? "")),
    },
    { title: "עוד לא אצל אף אחד", leads: leads.filter((l) => !l.holder || (l.holder !== CUSTOMER.id && !users().some((u) => u.id === l.holder))) },
  ].filter((g) => g.leads.length);

  const today = israelToday();
  const [, m, d] = today.split("-").map(Number);
  const summary = groups.map((g) => `${g.title} ${g.leads.length}`).join(" · ");

  // Blocks: one per group header and one per lead, so a split never cuts a lead in half.
  const blocks: string[] = [];
  let n = 0;
  for (const g of groups) {
    blocks.push(`━━ *${g.title}* (${g.leads.length}) ━━`);
    for (const l of g.leads) {
      const c = leadCard(l.id, [])!;
      const lines = [`*${++n}. ${c.title}*`, [c.sourceLabel, c.status === "none" ? null : c.statusLabel, c.trade].filter(Boolean).join(" · ")];
      if (l.holder === CUSTOMER.id && l.check_back_at)
        lines.push(`⏳ ${customerDue(l) ? "הגיע הזמן לחזור אליו" : "חוזרים אליו"} ב${sayWhen(l.check_back_at)}`);
      lines.push(...facts(c));
      if (c.details) lines.push(`📝 ${clip(c.details, REPORT_DETAILS_MAX)}`);
      if (c.nextStep) lines.push(`➡️ ${c.nextStep}`);
      blocks.push(lines.join("\n"));
    }
  }

  const parts: string[] = [];
  let cur: string[] = [];
  let len = 0;
  for (const b of blocks) {
    if (cur.length && len + b.length > PART_MAX) {
      parts.push(cur.join("\n\n"));
      cur = [];
      len = 0;
    }
    cur.push(b);
    len += b.length + 2;
  }
  if (cur.length) parts.push(cur.join("\n\n"));
  if (!parts.length) parts.push("אין לידים פתוחים.");

  const total = parts.length;
  return {
    parts: parts.map((p, i) => {
      const head = i === 0 ? `*דוח לידים — ${d}.${m}*\n${leads.length} פתוחים: ${summary}\n\n` : "";
      const of = total > 1 ? ` · ${i + 1}/${total}` : "";
      return `${head}${p}\n\n_${REPORT_MARK} ${d}.${m}${of}_`;
    }),
    leadIds: leads.map((l) => l.id),
  };
}

async function send(target: TextTarget, text: string, kind: "card" | "report", leadIds: number[], who: string): Promise<void> {
  const chat = TEXT_TARGETS[target];
  await sendText(chat.jid, text);
  getDb()
    .prepare("INSERT INTO sent_texts (hash, chat_jid, kind, lead_ids, sent_by, sent_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(hash(text), chat.jid, kind, JSON.stringify(leadIds), who, now());
}

/** Send one card as text, leaving out what `hide` names, and log it on the lead. */
export async function sendCardText(leadId: number, hide: Hideable[], who: string, target: TextTarget): Promise<{ to: string }> {
  const eff = effectiveHide(hide);
  const card = leadCard(leadId, eff);
  if (!card) throw new Error(`no lead #${leadId}`);
  const to = TEXT_TARGETS[target].label;
  await send(target, cardText(leadId, card), "card", [leadId], who);
  const what = eff.length ? `בלי ${eff.map((h) => HIDE_LABELS[h]).join(", ")}` : "כרטיס מלא";
  addEvent(leadId, who, "share", `הכרטיס נשלח כטקסט ל${to} (${what})`);
  return { to };
}

/**
 * Send the report of every open lead. To the preview group it is a draft and
 * touches no lead; to Dudu, each lead in it gets a line in its history.
 */
export async function sendReport(who: string, target: TextTarget): Promise<{ to: string; messages: number; leads: number }> {
  const { parts, leadIds } = reportText();
  for (const p of parts) await send(target, p, "report", leadIds, who);
  const to = TEXT_TARGETS[target].label;
  if (target !== "preview") for (const id of leadIds) addEvent(id, who, "share", `נכלל בדוח הלידים שנשלח ל${to}`);
  return { to, messages: parts.length, leads: leadIds.length };
}

/**
 * Called by the ingest for each newly read partner-chat message. Text the app
 * made (it carries a mark) is filed, never extracted:
 * - sent by the app straight into this chat → already logged, just closed;
 * - forwarded here from elsewhere (the preview group) → logged now, on each lead in it;
 * - edited on the way, so no record matches → a card still names its lead; a report is just closed.
 * Returns true when the message was ours.
 */
export function claimSentText(m: { id: string; chat_jid: string; content: string; from_me: boolean; sent_at: string }, partner: string): boolean {
  const match = m.content.match(MARK_IN_TEXT);
  if (!match) return false;
  const d = getDb();
  const sent = d.prepare("SELECT * FROM sent_texts WHERE hash = ? ORDER BY id DESC").all(hash(m.content)) as unknown as {
    chat_jid: string;
    kind: string;
    lead_ids: string;
  }[];
  const exists = (id: number) => !!d.prepare("SELECT 1 FROM leads WHERE id = ?").get(id);
  const isReport = !match[1];
  const leadIds = (sent.length ? (JSON.parse(sent[0].lead_ids) as number[]) : isReport ? [] : [Number(match[1])]).filter(exists);

  d.prepare("UPDATE messages SET lead_id = ?, state = 'done' WHERE id = ? AND chat_jid = ?").run(isReport ? null : (leadIds[0] ?? null), m.id, m.chat_jid);
  if (sent.some((s) => s.chat_jid === m.chat_jid)) return true;
  const what = isReport ? "דוח הלידים" : "הכרטיס";
  const text = m.from_me ? `${what} הועבר ל${partner} בוואטסאפ` : `${partner} שלח את ${what} בוואטסאפ`;
  for (const id of leadIds) addEvent(id, m.from_me ? "יניב" : partner, "share", text, null, null, m.sent_at);
  return true;
}
