export interface Msg {
  id: string;
  chatJid: string;
  fromMe: boolean;
  /** Written by the customer himself, in his own chat. */
  fromCustomer?: boolean;
  sentAt: string;
  content: string;
  mediaType: string;
  mediaUrl: string | null;
  transcript: string | null;
  error: string | null;
  /** Photos only: does it show the customer's phone — none | partial | full, null = not checked yet. */
  phoneShown?: "none" | "partial" | "full" | null;
  source?: string;
}

export interface LeadEvent {
  id: number;
  at: string;
  who: string;
  kind: string;
  text: string | null;
  from: string | null;
  to: string | null;
  /** Who last corrected this line by hand, or null. */
  editedBy: string | null;
}

export interface Proposal {
  status: string | null;
  statusLabel: string | null;
  /** What confirming does, in words: "פגישה · רביעי 14.10 10:00". */
  summary: string;
  /** What the customer said, in one sentence. */
  why: string;
  who: string;
  at: string;
}

export interface Lead {
  id: number;
  source: string;
  title: string;
  trade: string | null;
  customerName: string | null;
  phones: string[];
  address: string | null;
  city: string | null;
  details: string | null;
  status: string;
  statusLabel: string;
  /** A change the customer's own chat suggests; nothing moves until one of us confirms it. */
  proposal: Proposal | null;
  /** The user id whose move it is ("the ball is in his hands"), "customer" while we wait for him; null = nobody yet. */
  holder: string | null;
  /** holder = "customer" only: the day both of us check back with him ("2026-10-09"). */
  checkBackAt: string | null;
  /** That day has come: it is both partners' move. */
  checkBackDue: boolean;
  nextStep: string | null;
  visitAt: string | null;
  /** "2026-10-09T10:00", Israel time — a meeting before there is a contract (green). */
  meetingAt: string | null;
  /** "2026-10-12" — the working days once there is a contract (red). */
  workStart: string | null;
  workEnd: string | null;
  deal: Deal;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  touchedAt: string;
  messages: Msg[];
  events: LeadEvent[];
}

export interface Deal {
  clientPrice: number | null;
  /** true = "+ מע״מ", false = VAT included, null = not said */
  clientVat: boolean | null;
  subName: string | null;
  subPhone: string | null;
  subPrice: number | null;
  subVat: boolean | null;
  /** Materials, equipment, travel — before VAT. */
  materials: number | null;
  /** "sub" = a subcontractor does it; a user id = that partner does it himself. */
  executor: string | null;
  workDays: number | null;
  /** The day the customer approved the price — the job is the partnership's from then. */
  closedAt: string | null;
  paidAt: string | null;
  collectedBy: string | null;
  settledAt: string | null;
}

export const VAT = 0.18;

/** A price before VAT, whichever way it was quoted. */
export function net(price: number, vat: boolean | null): number {
  return vat === false ? price / (1 + VAT) : price;
}

export function shekel(n: number): string {
  return `₪${Math.round(n).toLocaleString("en-US")}`;
}

/** What stays with the partnership, before VAT — only when both sides are known. */
export function margin(d: Deal): number | null {
  if (d.clientPrice == null || d.subPrice == null) return null;
  return net(d.clientPrice, d.clientVat) - net(d.subPrice, d.subVat);
}

export interface BoardData {
  me: { id: string; name: string };
  statuses: { id: string; label: string }[];
  sources: { id: string; label: string; actor: string }[];
  /** Who the ball can be passed to. */
  people: { id: string; name: string }[];
  /** The ball's third place — the customer's hands. */
  customer: { id: string; name: string };
  leads: Lead[];
  /** The agreement: terms, who approved them, and every change. */
  partnership: import("./split").PartnershipData;
  unassigned: Msg[];
  pending: number;
}

/** "אצלי" for whoever is looking, "אצל דודו" for anyone else, "אצל הלקוח" while we wait for him. */
export function holderLabel(data: BoardData, id: string): string {
  if (id === data.customer.id) return `אצל ${data.customer.name}`;
  return id === data.me.id ? "אצלי" : `אצל ${data.people.find((p) => p.id === id)?.name ?? id}`;
}

/**
 * Is it `person`'s move? Their own leads, plus every lead whose customer has had his time —
 * then it is on both partners' lists until one of them takes the ball back.
 */
export function onPlate(l: Lead, person: string): boolean {
  return l.holder === person || l.checkBackDue;
}

/** "2026-10-09" → "ה׳ 9.10" */
export function shortDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${"אבגדהוש"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}׳ ${d}.${m}`;
}

/** An Israel date `days` from today. */
export function daysFromToday(days: number): string {
  const today = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jerusalem" }).slice(0, 10);
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Where a lead stands: nothing yet, a meeting set, or work agreed — dates optional. */
export const STATES = ["none", "meeting", "work"];
/** A lead taken off the board. Still there, behind the הוסרו tile, and can come back. */
export const CLOSED = ["removed"];

export const STATUS_TONE: Record<string, { dot: string; pill: string; rail: string }> = {
  none: { dot: "bg-amber", pill: "bg-amber-soft text-[#8a4a0b]", rail: "bg-amber" },
  meeting: { dot: "bg-[#16a34a]", pill: "bg-[#dcfce7] text-[#166534]", rail: "bg-[#16a34a]" },
  work: { dot: "bg-[#dc2626]", pill: "bg-[#fee2e2] text-[#991b1b]", rail: "bg-[#dc2626]" },
  removed: { dot: "bg-[#b9c4cf]", pill: "bg-[#f3f5f7] text-[#8a9aab]", rail: "bg-[#d4dbe2]" },
};

export const PARTNER_TONE: Record<string, { chip: string; initial: string }> = {
  basis: { chip: "bg-basis text-white", initial: "ב" },
  israel: { chip: "bg-israel text-white", initial: "י" },
};

export function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return d.toLocaleString("he-IL", sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function prettyPhone(p: string): string {
  const d = p.replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3)}` : p;
}

export function intlPhone(p: string): string {
  const d = p.replace(/\D/g, "");
  return d.startsWith("0") ? "972" + d.slice(1) : d;
}

export function wazeUrl(place: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(place)}&navigate=yes`;
}
