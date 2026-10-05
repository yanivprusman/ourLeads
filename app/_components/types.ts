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
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  messages: Msg[];
  events: LeadEvent[];
}

export interface BoardData {
  me: { id: string; name: string };
  statuses: { id: string; label: string }[];
  sources: { id: string; label: string; partner: string }[];
  leads: Lead[];
  unassigned: Msg[];
  pending: number;
}

export const STATUS_STYLE: Record<string, string> = {
  new: "bg-sky-100 text-sky-900",
  contacted: "bg-indigo-100 text-indigo-900",
  visit_scheduled: "bg-amber-100 text-amber-900",
  quoted: "bg-violet-100 text-violet-900",
  won: "bg-emerald-100 text-emerald-900",
  done: "bg-slate-200 text-slate-700",
  on_hold: "bg-orange-100 text-orange-900",
  lost: "bg-rose-100 text-rose-900",
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
