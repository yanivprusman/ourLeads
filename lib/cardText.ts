import "server-only";
import { sendText } from "./bridge";
import { CUSTOMER, REPORT_CHAT, users } from "./config";
import { money, sayWhen } from "./deal";
import { addEvent, getDb } from "./db";
import { leadCard, type Hideable, type LeadCard, HIDE_LABELS, effectiveHide } from "./shares";

/**
 * A lead card as plain WhatsApp text — for Dudu, who reads what is in the chat
 * and does not open links on his phone. It holds what the link's page holds,
 * minus the photos (they stay in the card on the board), and hides the same
 * fields the same way.
 *
 * It is sent to `REPORT_CHAT` only. Yaniv forwards it from there — and a
 * forwarded card lands in a partner chat the ingest reads, where its name,
 * phone and address would be extracted as a new lead. So the last line carries
 * the lead's number (`MARK`), and the ingest files any message bearing it on
 * that lead instead (`claimCardText`), the way it does a card link.
 */

const MARK = (id: number) => `ourLeads · ליד #${id}`;
const MARK_IN_TEXT = /ourLeads · ליד #(\d+)/;

/** How long one history line may be — the card is read on a phone, in a chat. */
const LINE_MAX = 280;
/** The newest history lines kept; the rest is on the board. */
const HISTORY_MAX = 12;

const clip = (t: string) => (t.length > LINE_MAX ? `${t.slice(0, LINE_MAX - 1)}…` : t);

/** "9.10 14:30" in Israel time, from an ISO instant. */
function at(iso: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}.${p.month} ${p.hour}:${p.minute}`;
}

function ball(c: LeadCard): string | null {
  if (!c.holder) return null;
  if (c.holder === CUSTOMER.id) return `אצל ${CUSTOMER.name}${c.checkBackAt ? ` — חוזרים אליו ב${sayWhen(c.checkBackAt)}` : ""}`;
  return `אצל ${users().find((u) => u.id === c.holder)?.name ?? c.holder}`;
}

export function cardText(leadId: number, c: LeadCard): string {
  const out: string[] = [`*${c.title}*`, [c.sourceLabel, c.status === "none" ? null : c.statusLabel, c.trade].filter(Boolean).join(" · ")];
  const b = ball(c);
  if (b) out.push(`🏀 ${b}`);
  out.push("");

  if (c.customerName) out.push(`👤 ${c.customerName}`);
  if (c.phones.length) out.push(`📞 ${c.phones.join(", ")}`);
  const where = [c.address, c.address && c.city && c.address.includes(c.city) ? null : c.city].filter(Boolean).join(", ");
  if (where) out.push(`📍 ${where}`);
  if (c.meetingAt) out.push(`📅 פגישה ${sayWhen(c.meetingAt)}`);
  if (c.workStart) out.push(`🛠 עבודה ${sayWhen(c.workStart)}${c.workEnd && c.workEnd !== c.workStart ? ` עד ${sayWhen(c.workEnd)}` : ""}`);
  if (c.deal) {
    const client = money(c.deal.clientPrice, c.deal.clientVat === null ? null : c.deal.clientVat ? 1 : 0);
    if (client) out.push(`💰 מול הלקוח ${client}`);
    const sub = money(c.deal.subPrice, c.deal.subVat === null ? null : c.deal.subVat ? 1 : 0);
    const subWho = [c.deal.subName, c.deal.subPhone].filter(Boolean).join(" ");
    if (sub || subWho) out.push(`🤝 קבלן משנה${subWho ? ` ${subWho}` : ""}${sub ? ` ${sub}` : ""}`);
  }

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
  out.push("", `_${MARK(leadId)}_`);
  return out.join("\n");
}

/** Send the card as text to `REPORT_CHAT`, leaving out what `hide` names, and log it on the lead. */
export async function sendCardText(leadId: number, hide: Hideable[], who: string): Promise<{ to: string }> {
  const eff = effectiveHide(hide);
  const card = leadCard(leadId, eff);
  if (!card) throw new Error(`no lead #${leadId}`);
  await sendText(REPORT_CHAT.jid, cardText(leadId, card));
  const what = eff.length ? `בלי ${eff.map((h) => HIDE_LABELS[h]).join(", ")}` : "כרטיס מלא";
  addEvent(leadId, who, "share", `הכרטיס נשלח כטקסט ל${REPORT_CHAT.label} (${what})`);
  return { to: REPORT_CHAT.label };
}

/**
 * Called by the ingest for each newly read partner-chat message. A message that
 * carries a card's mark is that card, forwarded: it is filed on its lead and
 * closed, so the extractor never reads its details as a new lead. Returns the
 * lead id, or null for an ordinary message.
 */
export function claimCardText(m: { id: string; chat_jid: string; content: string; from_me: boolean; sent_at: string }, actor: string, partner: string): number | null {
  const match = m.content.match(MARK_IN_TEXT);
  if (!match) return null;
  const leadId = Number(match[1]);
  const d = getDb();
  if (!d.prepare("SELECT 1 FROM leads WHERE id = ?").get(leadId)) return null;
  d.prepare("UPDATE messages SET lead_id = ?, state = 'done' WHERE id = ? AND chat_jid = ?").run(leadId, m.id, m.chat_jid);
  addEvent(leadId, m.from_me ? "יניב" : actor, "share", m.from_me ? `הכרטיס הועבר ל${partner} בוואטסאפ` : `${partner} שלח את הכרטיס בוואטסאפ`, null, null, m.sent_at);
  return leadId;
}
