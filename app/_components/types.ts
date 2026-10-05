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
  nextStep: string | null;
  visitAt: string | null;
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
  sources: { id: string; label: string; partner: string }[];
  leads: Lead[];
  unassigned: Msg[];
  pending: number;
}

/** The main road a lead travels. on_hold and lost are side exits, done is the end. */
export const PIPELINE = ["new", "contacted", "visit_scheduled", "quoted", "won", "done"];
export const SIDE = ["on_hold", "lost"];
export const CLOSED = ["done", "lost"];

export const STATUS_TONE: Record<string, { dot: string; pill: string; rail: string }> = {
  new: { dot: "bg-amber", pill: "bg-amber-soft text-[#8a4a0b]", rail: "bg-amber" },
  contacted: { dot: "bg-harbour-2", pill: "bg-[#e3f1fa] text-harbour", rail: "bg-harbour-2" },
  visit_scheduled: { dot: "bg-[#6c5ce7]", pill: "bg-[#ecebfd] text-[#3f33a8]", rail: "bg-[#6c5ce7]" },
  quoted: { dot: "bg-[#b0489a]", pill: "bg-[#f8e8f4] text-[#7d2a6b]", rail: "bg-[#b0489a]" },
  won: { dot: "bg-israel", pill: "bg-[#def5ec] text-[#0b5c47]", rail: "bg-israel" },
  done: { dot: "bg-[#8a9aab]", pill: "bg-[#eceff3] text-ink-2", rail: "bg-[#8a9aab]" },
  on_hold: { dot: "bg-[#b9c4cf]", pill: "bg-[#eef1f4] text-muted", rail: "bg-[#b9c4cf]" },
  lost: { dot: "bg-[#d4dbe2]", pill: "bg-[#f3f5f7] text-[#8a9aab] line-through", rail: "bg-[#d4dbe2]" },
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

/**
 * How long a NEW lead has been waiting for a first call. Dudu: "the hotter it is, the more
 * money it is — the colder it gets, the less." So this is the number on a new card, not a date.
 */
export function heat(lead: Lead, now: number): { label: string; level: 0 | 1 | 2 } | null {
  if (lead.status !== "new") return null;
  const mins = Math.max(0, Math.round((now - new Date(lead.lastMessageAt ?? lead.createdAt).getTime()) / 60000));
  const label =
    mins < 1 ? "עכשיו" : mins < 60 ? `${mins} דק׳` : mins < 48 * 60 ? `${Math.floor(mins / 60)} שע׳` : `${Math.floor(mins / 1440)} ימים`;
  return { label, level: mins < 60 ? 0 : mins < 6 * 60 ? 1 : 2 };
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
