import "server-only";
import { randomBytes } from "node:crypto";
import { CARD_ORIGIN, SOURCES } from "./config";
import { BUSINESS_SOURCE } from "./assistant";
import { STATUS_LABELS, addEvent, getDb, getLead, now, statusLabel, type EventRow, type MessageRow } from "./db";
import { messageView } from "./view";

/**
 * A lead card sent outside the board — to Dudu before he uses the app, or to
 * anyone else — as a link that opens that one lead and nothing else, with no
 * sign-in.
 *
 * Why a link and not the card pasted as text: the board reads the partner chats
 * whole, Yaniv's own messages included. A pasted card is a customer name, a
 * phone and an address — the extractor would read it as a new lead, or add it to
 * one. A link is recognised by the ingest (`claimCardLinks`) and logged as "the
 * card was sent" without ever reaching the extractor.
 *
 * The sender picks what to leave out. That choice is stored with the token, never
 * carried in the URL, so the holder of a link cannot ask for more than was given.
 */

export const HIDEABLE = ["contact", "address", "price", "photos", "history"] as const;
export type Hideable = (typeof HIDEABLE)[number];

export const HIDE_LABELS: Record<Hideable, string> = {
  contact: "פרטי הלקוח",
  address: "כתובת",
  price: "מחיר",
  photos: "תמונות",
  history: "היסטוריה",
};

/**
 * The history is free text — WhatsApp messages and notes — and says the phone
 * number, the street and the price in its own words. It cannot be filtered field
 * by field, so hiding any of those three hides it too.
 */
export function effectiveHide(hide: Hideable[]): Hideable[] {
  const set = new Set(hide);
  if (set.has("contact") || set.has("address") || set.has("price")) set.add("history");
  return HIDEABLE.filter((h) => set.has(h));
}

export function parseHide(v: unknown): Hideable[] | null {
  if (!Array.isArray(v)) return null;
  if (!v.every((h) => (HIDEABLE as readonly unknown[]).includes(h))) return null;
  return effectiveHide(v as Hideable[]);
}

interface ShareRow {
  token: string;
  lead_id: number;
  hide: string;
  created_by: string;
  created_at: string;
  revoked_at: string | null;
}

export function cardUrl(token: string): string {
  return `${CARD_ORIGIN}/c/${token}`;
}

function describeHide(hide: Hideable[]): string {
  return hide.length ? `בלי ${hide.map((h) => HIDE_LABELS[h]).join(", ")}` : "כרטיס מלא";
}

export function createShare(leadId: number, hide: Hideable[], who: string): { token: string; url: string } {
  if (!getLead(leadId)) throw new Error(`no lead #${leadId}`);
  const token = randomBytes(12).toString("base64url");
  const eff = effectiveHide(hide);
  getDb()
    .prepare("INSERT INTO shares (token, lead_id, hide, created_by, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(token, leadId, JSON.stringify(eff), who, now());
  addEvent(leadId, who, "share", `קישור לכרטיס (${describeHide(eff)})`);
  return { token, url: cardUrl(token) };
}

export function listShares(leadId: number) {
  const rows = getDb()
    .prepare("SELECT * FROM shares WHERE lead_id = ? ORDER BY created_at DESC")
    .all(leadId) as unknown as ShareRow[];
  return rows.map((r) => ({
    token: r.token,
    url: cardUrl(r.token),
    hide: JSON.parse(r.hide) as Hideable[],
    createdBy: r.created_by,
    createdAt: r.created_at,
    revoked: !!r.revoked_at,
  }));
}

export function revokeShare(token: string, who: string): boolean {
  const row = getShare(token);
  if (!row || row.revoked_at) return false;
  getDb().prepare("UPDATE shares SET revoked_at = ? WHERE token = ?").run(now(), token);
  addEvent(row.lead_id, who, "share", `קישור לכרטיס בוטל (${describeHide(JSON.parse(row.hide))})`);
  return true;
}

function getShare(token: string): ShareRow | undefined {
  return getDb().prepare("SELECT * FROM shares WHERE token = ?").get(token) as unknown as ShareRow | undefined;
}

const TOKEN_IN_TEXT = /our-leads\.(?:prod|dev)\.ya-niv\.com\/c\/([A-Za-z0-9_-]{16})/g;
const HAS_TOKEN = /our-leads\.(?:prod|dev)\.ya-niv\.com\/c\/[A-Za-z0-9_-]{16}/;

/**
 * Called by the ingest for each newly read message. A message carrying a card
 * link is that card being sent: it is filed on the lead, logged, and closed — it
 * never reaches the extractor. Returns the lead id, or null for an ordinary message.
 */
export function claimCardLink(m: { id: string; chat_jid: string; content: string; from_me: boolean; sent_at: string }, actor: string): number | null {
  for (const match of m.content.matchAll(TOKEN_IN_TEXT)) {
    const share = getShare(match[1]);
    if (!share) continue;
    const d = getDb();
    d.prepare("UPDATE messages SET lead_id = ?, state = 'done' WHERE id = ? AND chat_jid = ?").run(share.lead_id, m.id, m.chat_jid);
    const to = SOURCES.find((s) => s.jid === m.chat_jid)?.actor ?? "השותף";
    addEvent(
      share.lead_id,
      m.from_me ? "יניב" : actor,
      "share",
      m.from_me ? `הכרטיס נשלח ל${to} בוואטסאפ` : `${to} שלח את הכרטיס בוואטסאפ`,
      null,
      null,
      m.sent_at,
    );
    return share.lead_id;
  }
  return null;
}

/** Free text says what the hidden fields hold in its own words; take out what can be recognised. */
const PHONE = /(?:\+?972[-\s]?|0)(?:[-\s]?\d){8,9}/g;
const MONEY = /₪\s?[\d,.]+|[\d,.]+\s?(?:₪|ש["״]?ח|שקל(?:ים)?)/g;
function scrub(text: string | null, hide: Set<Hideable>): string | null {
  if (!text) return text;
  let t = text;
  if (hide.has("contact")) t = t.replace(PHONE, "•••");
  if (hide.has("price")) t = t.replace(MONEY, "•••");
  return t;
}

/** The card as the link's holder sees it — only what was not hidden, and null for a dead link. */
export function cardView(token: string) {
  const share = getShare(token);
  if (!share) return null;
  if (share.revoked_at) return { revoked: true as const };
  return leadCard(share.lead_id, JSON.parse(share.hide) as Hideable[]);
}

/** The card as anyone outside the board sees it — a link's page or the text sent to WhatsApp. Null for no such lead. */
export function leadCard(leadId: number, hidden: Hideable[]) {
  const lead = getLead(leadId);
  if (!lead) return null;
  const hide = new Set(effectiveHide(hidden));
  const d = getDb();
  const msgs = d
    .prepare("SELECT * FROM messages WHERE lead_id = ? ORDER BY sent_at ASC")
    .all(lead.id) as unknown as MessageRow[];
  const events = hide.has("history")
    ? []
    : (d.prepare("SELECT * FROM events WHERE lead_id = ? AND kind != 'share' AND deleted_at IS NULL ORDER BY at ASC, id ASC").all(lead.id) as unknown as EventRow[]);
  const source = [...SOURCES, BUSINESS_SOURCE].find((s) => s.id === lead.source);
  const views = msgs.map(messageView);
  return {
    revoked: false as const,
    hidden: [...hide],
    sourceLabel: source?.label ?? lead.source,
    partner: source?.actor ?? "שותף",
    title: scrub(lead.title, hide)!,
    trade: lead.trade,
    city: lead.city,
    address: hide.has("address") ? null : lead.address,
    customerName: hide.has("contact") ? null : lead.customer_name,
    phones: hide.has("contact") ? [] : (JSON.parse(lead.phones) as string[]),
    details: scrub(lead.details, hide),
    nextStep: scrub(lead.next_step, hide),
    status: lead.status,
    statusLabel: STATUS_LABELS[lead.status],
    holder: lead.holder,
    checkBackAt: lead.check_back_at,
    meetingAt: lead.meeting_at,
    workStart: lead.work_start,
    workEnd: lead.work_end,
    deal: hide.has("price")
      ? null
      : {
          clientPrice: lead.client_price,
          clientVat: lead.client_vat === null ? null : !!lead.client_vat,
          subName: lead.sub_name,
          subPhone: lead.sub_phone,
          subPrice: lead.sub_price,
          subVat: lead.sub_vat === null ? null : !!lead.sub_vat,
        },
    // Without the customer's details, a photo that shows the whole number goes too — and so
    // does one not checked yet (lib/photoPhones.ts). Part of a number stays: it reaches no one.
    photos: hide.has("photos")
      ? []
      : views
          .filter((m) => m.mediaType === "image" && m.mediaUrl)
          .filter((m) => !hide.has("contact") || m.phoneShown === "none" || m.phoneShown === "partial")
          .map((m) => m.mediaUrl!),
    timeline: hide.has("history")
      ? []
      : [
          // A card link in the chat is how this page was sent — not part of the lead's story.
          ...views
            .filter((m) => m.mediaType !== "image" && !HAS_TOKEN.test(m.content))
            .map((m) => ({
              at: m.sentAt,
              kind: "msg" as const,
              m: {
                id: m.id,
                fromMe: m.fromMe,
                sentAt: m.sentAt,
                content: m.content,
                mediaType: m.mediaType,
                // "No photos" covers the videos too — a phone screen recording shows the same as a screenshot.
                mediaUrl: hide.has("photos") && m.mediaType === "video" ? null : m.mediaUrl,
                transcript: m.transcript,
              },
            })),
          ...events.map((e) => ({
            at: e.at,
            kind: "event" as const,
            e: { at: e.at, who: e.who, kind: e.kind, text: e.text, from: e.from_status ? statusLabel(e.from_status) : null, to: e.to_status ? statusLabel(e.to_status) : null },
          })),
        ].sort((a, b) => a.at.localeCompare(b.at)),
  };
}

export type CardView = NonNullable<ReturnType<typeof cardView>>;
export type LeadCard = NonNullable<ReturnType<typeof leadCard>>;
