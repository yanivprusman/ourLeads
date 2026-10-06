import "server-only";
import { SOURCES, users } from "./config";
import { STATUSES, STATUS_LABELS, getDb, statusLabel, type EventRow, type LeadRow, type MessageRow } from "./db";
import { mediaSig } from "./auth";

/** The board as both clients read it: one payload, small enough to send whole. */

export function messageView(m: MessageRow) {
  return {
    id: m.id,
    chatJid: m.chat_jid,
    fromMe: !!m.from_me,
    sentAt: m.sent_at,
    content: m.content,
    mediaType: m.media_type,
    mediaUrl: m.media_file ? `/api/media/${encodeURIComponent(m.media_file)}?sig=${mediaSig(m.media_file)}` : null,
    transcript: m.transcript,
    error: m.error,
  };
}

function leadView(l: LeadRow, msgs: MessageRow[], events: EventRow[]) {
  return {
    id: l.id,
    source: l.source,
    title: l.title,
    trade: l.trade,
    customerName: l.customer_name,
    phones: JSON.parse(l.phones) as string[],
    address: l.address,
    city: l.city,
    details: l.details,
    status: l.status,
    statusLabel: STATUS_LABELS[l.status],
    holder: l.holder,
    nextStep: l.next_step,
    visitAt: l.visit_at,
    meetingAt: l.meeting_at,
    workStart: l.work_start,
    workEnd: l.work_end,
    deal: {
      clientPrice: l.client_price,
      clientVat: l.client_vat === null ? null : !!l.client_vat,
      subName: l.sub_name,
      subPhone: l.sub_phone,
      subPrice: l.sub_price,
      subVat: l.sub_vat === null ? null : !!l.sub_vat,
    },
    createdAt: l.created_at,
    updatedAt: l.updated_at,
    lastMessageAt: l.last_message_at,
    messages: msgs.map(messageView),
    events: events.map((e) => ({
      at: e.at,
      who: e.who,
      kind: e.kind,
      text: e.text,
      from: e.from_status ? statusLabel(e.from_status) : null,
      to: e.to_status ? statusLabel(e.to_status) : null,
    })),
  };
}

export function board(me: { id: string; name: string }) {
  const d = getDb();
  const leads = d
    .prepare("SELECT * FROM leads ORDER BY COALESCE(last_message_at, created_at) DESC")
    .all() as unknown as LeadRow[];
  const msgs = d.prepare("SELECT * FROM messages ORDER BY sent_at ASC").all() as unknown as MessageRow[];
  const events = d.prepare("SELECT * FROM events ORDER BY at ASC, id ASC").all() as unknown as EventRow[];
  const byLead = new Map<number, MessageRow[]>();
  const unassigned: MessageRow[] = [];
  let pending = 0;
  for (const m of msgs) {
    if (m.state === "pending") pending++;
    if (m.lead_id) byLead.set(m.lead_id, [...(byLead.get(m.lead_id) ?? []), m]);
    else if (m.state === "ignored" && !m.from_me) unassigned.push(m);
  }
  const evByLead = new Map<number, EventRow[]>();
  for (const e of events) evByLead.set(e.lead_id, [...(evByLead.get(e.lead_id) ?? []), e]);
  return {
    me,
    statuses: STATUSES.map((s) => ({ id: s, label: STATUS_LABELS[s] })),
    sources: SOURCES.map((s) => ({ id: s.id, label: s.label, partner: s.partner })),
    /** Who the ball can be passed to. */
    people: users().map((u) => ({ id: u.id, name: u.name })),
    leads: leads.map((l) => leadView(l, byLead.get(l.id) ?? [], evByLead.get(l.id) ?? [])),
    unassigned: unassigned.slice(-40).reverse().map((m) => ({ ...messageView(m), source: m.source })),
    pending,
  };
}
