export interface Msg {
  id: string;
  chatJid: string;
  fromMe: boolean;
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
  at: string;
  who: string;
  kind: string;
  text: string | null;
  from: string | null;
  to: string | null;
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
  /** The user id whose move it is ("the ball is in his hands"); null = nobody yet. */
  holder: string | null;
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
  leads: Lead[];
  unassigned: Msg[];
  pending: number;
}

/** "אצלי" for whoever is looking, "אצל דודו" for anyone else. */
export function holderLabel(data: BoardData, id: string): string {
  return id === data.me.id ? "אצלי" : `אצל ${data.people.find((p) => p.id === id)?.name ?? id}`;
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
