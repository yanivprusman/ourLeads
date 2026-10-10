import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { dbquery, revokeText, sendText } from "./bridge";
import { ASSISTANT, CUSTOMER, TEXT_TARGETS, users, type TextTarget } from "./config";
import { money, sayWhen } from "./deal";
import { CLOSED, addEvent, customerDue, getDb, israelToday, now, type LeadRow } from "./db";
import { leadCard, type Hideable, type LeadCard, HIDE_LABELS, effectiveHide } from "./shares";

/**
 * Leads as plain WhatsApp text — for someone who reads what is in the chat and
 * does not open links on his phone (a subcontractor). Two shapes:
 *
 * - **a card**: one lead, everything its link page holds minus the photos, with
 *   the same fields hidden the same way;
 * - **the report**: every open lead, short, grouped by whose move it is.
 *
 * Either goes to a `TEXT_TARGETS` chat — the preview group — and is forwarded by
 * hand from there.
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
/** WhatsApp's own limit on one text message; the details message is refused above it, never cut. */
const WHATSAPP_MAX = 65_000;

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
  return [...users(), ASSISTANT].find((u) => u.id === id)?.name ?? id;
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
 * the customer (those due today first), then nobody yet — as two messages:
 * first the details of every lead, then the summary (last, so it is what the
 * chat shows). Both number the leads the same way. Returns the messages and the
 * leads in them.
 */
export interface ReportChoice {
  id: number;
  title: string;
  /** The group it is listed under ("אצל העוזר"…). */
  group: string;
}

export function reportText(only?: number[]): { parts: string[]; leadIds: number[]; choices: ReportChoice[] } {
  const open = reportLeads();
  const allGroups: { title: string; leads: LeadRow[] }[] = [
    ...[...users(), ASSISTANT].map((u) => ({ title: `אצל ${u.name}`, leads: open.filter((l) => l.holder === u.id) })),
    {
      title: `אצל ${CUSTOMER.name}`,
      leads: open
        .filter((l) => l.holder === CUSTOMER.id)
        .sort((a, b) => Number(customerDue(b)) - Number(customerDue(a)) || (a.check_back_at ?? "").localeCompare(b.check_back_at ?? "")),
    },
    { title: "עוד לא אצל אף אחד", leads: open.filter((l) => !l.holder || (l.holder !== CUSTOMER.id && ![...users(), ASSISTANT].some((u) => u.id === l.holder))) },
  ].filter((g) => g.leads.length);
  // Every open lead, as the picker lists it; then the report keeps only those chosen.
  const choices = allGroups.flatMap((g) => g.leads.map((l) => ({ id: l.id, title: l.title, group: g.title })));
  if (only && !only.length) throw new Error("לא נבחרו לידים לדוח");
  const keep = only ? new Set(only) : null;
  const groups = allGroups.map((g) => ({ ...g, leads: keep ? g.leads.filter((l) => keep.has(l.id)) : g.leads })).filter((g) => g.leads.length);
  const leads = groups.flatMap((g) => g.leads);
  if (keep && leads.length !== keep.size) throw new Error("חלק מהלידים שנבחרו כבר לא פתוחים — רעננו ובחרו שוב");

  const [, m, d] = israelToday().split("-").map(Number);
  const day = `${d}.${m}`;
  const counts = groups.map((g) => `${g.title} ${g.leads.length}`).join(" · ");
  const waiting = (l: LeadRow) => (l.holder === CUSTOMER.id && l.check_back_at ? `⏳ ${customerDue(l) ? "הגיע הזמן לחזור אליו" : "חוזרים אליו"} ב${sayWhen(l.check_back_at)}` : null);

  const details: string[] = [`*דוח לידים — ${day} · פירוט*`];
  const summary: string[] = [`*דוח לידים — ${day} · סיכום*`, `${leads.length} ${keep ? `מתוך ${open.length} פתוחים` : "פתוחים"}: ${counts}`];
  let n = 0;
  for (const g of groups) {
    details.push(`━━ *${g.title}* (${g.leads.length}) ━━`);
    summary.push(`*${g.title}* (${g.leads.length})`);
    const rows: string[] = [];
    for (const l of g.leads) {
      const c = leadCard(l.id, [])!;
      n++;
      const lines = [`*${n}. ${c.title}*`, [c.sourceLabel, c.status === "none" ? null : c.statusLabel, c.trade].filter(Boolean).join(" · ")];
      const w = waiting(l);
      if (w) lines.push(w);
      lines.push(...facts(c));
      if (c.details) lines.push(`📝 ${c.details}`);
      if (c.nextStep) lines.push(`➡️ ${c.nextStep}`);
      details.push(lines.join("\n"));
      rows.push(`${n}. ${c.title}${l.holder === CUSTOMER.id && l.check_back_at ? ` — ${customerDue(l) ? "⏳ לחזור אליו" : `עד ${sayWhen(l.check_back_at)}`}` : ""}`);
    }
    summary.push(rows.join("\n"));
  }
  if (!leads.length) summary.push("אין לידים פתוחים.");

  const parts = [...(leads.length ? [details.join("\n\n")] : []), summary.join("\n\n")].map((p) => `${p}\n\n_${REPORT_MARK} ${day}_`);
  const long = parts.find((p) => p.length > WHATSAPP_MAX);
  if (long) throw new Error(`הדוח ארוך מדי להודעת וואטסאפ אחת (${long.length} תווים, המקסימום ${WHATSAPP_MAX})`);
  return { parts, leadIds: leads.map((l) => l.id), choices };
}

async function send(target: TextTarget, text: string, kind: "card" | "report", leadIds: number[], who: string, batch: string): Promise<void> {
  const chat = TEXT_TARGETS[target];
  const messageId = await sendText(chat.jid, text);
  getDb()
    .prepare("INSERT INTO sent_texts (hash, chat_jid, kind, lead_ids, sent_by, sent_at, message_id, batch, target) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(hash(text), chat.jid, kind, JSON.stringify(leadIds), who, now(), messageId, batch, target);
}

const newBatch = () => randomBytes(8).toString("hex");

/** Send one card as text, leaving out what `hide` names, and log it on the lead. */
export async function sendCardText(leadId: number, hide: Hideable[], who: string, target: TextTarget): Promise<{ to: string }> {
  const eff = effectiveHide(hide);
  const card = leadCard(leadId, eff);
  if (!card) throw new Error(`no lead #${leadId}`);
  const to = TEXT_TARGETS[target].label;
  await send(target, cardText(leadId, card), "card", [leadId], who, newBatch());
  const what = eff.length ? `בלי ${eff.map((h) => HIDE_LABELS[h]).join(", ")}` : "כרטיס מלא";
  addEvent(leadId, who, "share", `הכרטיס נשלח כטקסט ל${to} (${what})`);
  return { to };
}

/**
 * Send the report of every open lead. To the preview group it is a draft and
 * touches no lead; to any other target, each lead in it gets a line in its history.
 */
export async function sendReport(who: string, target: TextTarget, only?: number[]): Promise<{ to: string; messages: number; leads: number }> {
  const { parts, leadIds } = reportText(only);
  const batch = newBatch();
  for (const p of parts) await send(target, p, "report", leadIds, who, batch);
  const to = TEXT_TARGETS[target].label;
  if (target !== "preview") for (const id of leadIds) addEvent(id, who, "share", `נכלל בדוח הלידים שנשלח ל${to}`);
  return { to, messages: parts.length, leads: leadIds.length };
}

/**
 * WhatsApp lets a sender delete a message for everyone for about two days; we
 * offer it a little short of that, so the button never promises what WhatsApp
 * will then refuse.
 */
const DELETE_WINDOW_MS = 40 * 3600_000;

export interface SentBatch {
  batch: string;
  kind: "card" | "report";
  to: string;
  target: TextTarget;
  leadIds: number[];
  messages: number;
  sentBy: string;
  sentAt: string;
}

/**
 * Recent sends that can still be deleted, newest first — one entry per send (a
 * report's two messages are one entry). `leadId` narrows to the cards of one
 * lead; without it, the reports.
 */
export function deletableSends(leadId?: number): SentBatch[] {
  const since = new Date(Date.now() - DELETE_WINDOW_MS).toISOString();
  const rows = getDb()
    .prepare(
      `SELECT batch, kind, target, lead_ids, sent_by, MIN(sent_at) AS sent_at, COUNT(*) AS n FROM sent_texts
       WHERE message_id IS NOT NULL AND deleted_at IS NULL AND sent_at >= ? AND kind = ?
       GROUP BY batch ORDER BY sent_at DESC`,
    )
    .all(since, leadId === undefined ? "report" : "card") as unknown as { batch: string; kind: "card" | "report"; target: TextTarget; lead_ids: string; sent_by: string; sent_at: string; n: number }[];
  return rows
    .map((r) => ({
      batch: r.batch,
      kind: r.kind,
      target: r.target,
      to: TEXT_TARGETS[r.target]?.label ?? r.target,
      leadIds: JSON.parse(r.lead_ids) as number[],
      messages: r.n,
      sentBy: r.sent_by,
      sentAt: r.sent_at,
    }))
    .filter((b) => leadId === undefined || b.leadIds.includes(leadId));
}

/**
 * Delete a send for everyone — every message in it. Logged on the leads it was
 * logged on when sent (a card anywhere, a report to a real chat); a report to the
 * preview group touched no lead and its deletion touches none either.
 */
export async function deleteSend(batch: string, who: string): Promise<{ deleted: number }> {
  const d = getDb();
  const rows = d
    .prepare("SELECT id, chat_jid, message_id, kind, target, lead_ids, sent_at FROM sent_texts WHERE batch = ? AND deleted_at IS NULL AND message_id IS NOT NULL")
    .all(batch) as unknown as { id: number; chat_jid: string; message_id: string; kind: string; target: TextTarget; lead_ids: string; sent_at: string }[];
  if (!rows.length) throw new Error("אין מה למחוק — ההודעות כבר נמחקו, או שלא נשלחו מכאן");
  for (const r of rows) {
    await revokeText(r.chat_jid, r.message_id);
    d.prepare("UPDATE sent_texts SET deleted_at = ? WHERE id = ?").run(now(), r.id);
  }
  const first = rows[0];
  const to = TEXT_TARGETS[first.target]?.label ?? first.target;
  if (first.kind === "card" || first.target !== "preview") {
    const what = first.kind === "card" ? `הכרטיס שנשלח ל${to}` : `דוח הלידים שנשלח ל${to}`;
    for (const id of JSON.parse(first.lead_ids) as number[])
      if (d.prepare("SELECT 1 FROM leads WHERE id = ?").get(id)) addEvent(id, who, "share", `${what} נמחק מהוואטסאפ`);
  }
  return { deleted: rows.length };
}

/**
 * Delete for everyone every message this app has put in the preview group that is
 * still there. The bridge's own record of the chat is the list — not
 * `sent_texts` — so sends from before message ids were kept are found too: our
 * own messages there that carry the app's mark. A message WhatsApp will no
 * longer delete (too old) is reported, and the rest still go.
 */
export async function clearPreview(who: string): Promise<{ deleted: number; failed: string[] }> {
  const chat = TEXT_TARGETS.preview;
  const rows = await dbquery(
    "SELECT id, content FROM messages WHERE chat_jid = ? AND is_from_me = 1 AND deleted_at IS NULL AND content LIKE ? ORDER BY timestamp",
    [chat.jid, "%ourLeads · %"],
  );
  const d = getDb();
  let deleted = 0;
  const failed: string[] = [];
  for (const [id, content] of rows.map((r) => [String(r[0]), String(r[1])])) {
    const mark = content.match(MARK_IN_TEXT);
    if (!mark) continue;
    try {
      await revokeText(chat.jid, id);
    } catch (e) {
      failed.push((e as Error).message);
      continue;
    }
    deleted++;
    const row = d.prepare("SELECT id, kind FROM sent_texts WHERE message_id = ?").get(id) as { id: number; kind: string } | undefined;
    if (row) d.prepare("UPDATE sent_texts SET deleted_at = ? WHERE id = ?").run(now(), row.id);
    // A card sent here was logged on its lead; say it is gone. A report to the preview group touched no lead.
    if (mark[1] && d.prepare("SELECT 1 FROM leads WHERE id = ?").get(Number(mark[1])))
      addEvent(Number(mark[1]), who, "share", `הכרטיס שנשלח ל${chat.label} נמחק מהוואטסאפ`);
  }
  return { deleted, failed };
}

