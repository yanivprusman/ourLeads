import "server-only";
import { ASSISTANT, CUSTOMER, SOURCES, brandOf, users } from "./config";
import { STATUSES, STATUS_LABELS, customerDue, getDb, statusLabel, type EventRow, type LeadRow, type MessageRow } from "./db";
import { mediaSig } from "./auth";
import { posterName, thumbName } from "./poster";
import { partnership } from "./partnership";
import { describeProposal, readProposal } from "./proposal";
import { BUSINESS_SOURCE, busyState, windowOpenUntil } from "./assistant";
import { cloudConfigured, isBusinessJid } from "./cloud";

/** The board as both clients read it: one payload, small enough to send whole. */

function mediaUrl(file: string): string {
  return `/api/media/${encodeURIComponent(file)}?sig=${mediaSig(file)}`;
}

export function messageView(m: MessageRow) {
  return {
    id: m.id,
    chatJid: m.chat_jid,
    fromMe: !!m.from_me,
    /** Written by the customer himself, in his own chat (lib/customerChats.ts) or on the business line (lib/assistant.ts). */
    fromCustomer: (m.source === "customer" || m.source === BUSINESS_SOURCE.id) && !m.from_me,
    /** Business line, from_me: written by the assistant, not by one of us. */
    byAssistant: !!m.from_me && m.written_by === ASSISTANT.id,
    /** Business line, from_me by hand: which of us wrote it. */
    writtenBy: m.from_me && m.written_by !== ASSISTANT.id ? m.written_by : null,
    sentAt: m.sent_at,
    content: m.content,
    mediaType: m.media_type,
    mediaUrl: m.media_file ? mediaUrl(m.media_file) : null,
    /** Videos only: a still frame for the top of the card (lib/poster.ts). */
    posterUrl: m.media_type === "video" && m.media_file ? mediaUrl(posterName(m.media_file)) : null,
    /** A small copy for wherever it is drawn small (lib/poster.ts): of the photo, or of a video's poster. */
    thumbUrl: !m.media_file ? null : m.media_type === "image" ? mediaUrl(thumbName(m.media_file)) : m.media_type === "video" ? mediaUrl(thumbName(posterName(m.media_file))) : null,
    transcript: m.transcript,
    error: m.error,
    /** Photos only: does it show the customer's phone — none | partial | full, null = not checked yet. */
    phoneShown: m.phone_shown,
  };
}

function proposalView(l: LeadRow) {
  const p = readProposal(l);
  if (!p) return null;
  return { status: p.status, statusLabel: p.status ? STATUS_LABELS[p.status] : null, summary: describeProposal(p), why: p.why, who: p.who, at: p.at };
}

function replyWindow(until: string | null) {
  return { replyUntil: until, canReply: !!until && until > new Date().toISOString() };
}

function leadView(l: LeadRow, msgs: MessageRow[], events: EventRow[]) {
  const business = [...msgs].reverse().find((m) => isBusinessJid(m.chat_jid))?.chat_jid ?? null;
  return {
    id: l.id,
    /** The brand it is shown under (lib/config.ts brandOf) — business-line leads included. */
    source: brandOf(l),
    title: l.title,
    trade: l.trade,
    customerName: l.customer_name,
    phones: JSON.parse(l.phones) as string[],
    address: l.address,
    city: l.city,
    details: l.details,
    status: l.status,
    statusLabel: STATUS_LABELS[l.status],
    /** A change the customer's chat suggests, waiting for one of us to confirm (lib/proposal.ts). */
    proposal: proposalView(l),
    holder: l.holder,
    /** holder = "customer" only: the day both of us check back with him, and whether it has come. */
    checkBackAt: l.holder === CUSTOMER.id ? l.check_back_at : null,
    checkBackDue: customerDue(l),
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
      materials: l.materials,
      executor: l.executor,
      workDays: l.work_days,
      closedAt: l.closed_at,
      paidAt: l.paid_at,
      collectedBy: l.collected_by,
      settledAt: l.settled_at,
    },
    createdAt: l.created_at,
    updatedAt: l.updated_at,
    lastMessageAt: l.last_message_at,
    /** The last time anything happened to it — an edit, a message, a history line, being opened. "Last touched first" sorts by this. */
    touchedAt: [l.updated_at, l.last_message_at, l.viewed_at, ...msgs.map((m) => m.sent_at), ...events.map((e) => e.at)].reduce<string>(
      (a, b) => (b && b > a ? b : a),
      l.created_at,
    ),
    messages: msgs.map(messageView),
    /** He wrote on the business line: we can answer him there until `replyUntil` (Meta's 24-hour window). */
    businessChat: business ? replyWindow(windowOpenUntil(business)) : null,
    events: events.map((e) => ({
      id: e.id,
      at: e.at,
      who: e.who,
      kind: e.kind,
      text: e.text,
      from: e.from_status ? statusLabel(e.from_status) : null,
      to: e.to_status ? statusLabel(e.to_status) : null,
      editedBy: e.edited_by,
    })),
  };
}

export function board(me: { id: string; name: string }) {
  const d = getDb();
  const leads = d
    // Fixed order, oldest first: by when the lead came in — its first message, or
    // created_at for a lead born from a voice command (it has no messages). Later
    // messages never move it, so the list reads the same every time it is opened;
    // id breaks the ties the first import left (many leads share one second). Photos added
    // later by hand (chat 'upload') are not when the lead came in.
    .prepare(
      `SELECT * FROM leads ORDER BY
         COALESCE((SELECT MIN(sent_at) FROM messages WHERE lead_id = leads.id AND chat_jid != 'upload'), created_at) ASC, id ASC`,
    )
    .all() as unknown as LeadRow[];
  const msgs = d.prepare("SELECT * FROM messages ORDER BY sent_at ASC").all() as unknown as MessageRow[];
  const events = d.prepare("SELECT * FROM events WHERE deleted_at IS NULL ORDER BY at ASC, id ASC").all() as unknown as EventRow[];
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
    sources: SOURCES.map((s) => ({ id: s.id, label: s.label, actor: s.actor })),
    /** The business line's assistant: whether the line is set up, and whether it is answering for us (busy). */
    assistant: { ...ASSISTANT, configured: cloudConfigured(), ...busyState() },
    /** Who the ball can be passed to. */
    people: users().map((u) => ({ id: u.id, name: u.name })),
    /** The ball's third place: the customer's hands (not one of `people`). */
    customer: CUSTOMER,
    leads: leads.map((l) => leadView(l, byLead.get(l.id) ?? [], evByLead.get(l.id) ?? [])),
    partnership: partnership(),
    unassigned: unassigned.slice(-40).reverse().map((m) => ({ ...messageView(m), source: m.source })),
    pending,
  };
}
