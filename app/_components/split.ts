import { net, type Deal, type Lead } from "./types";

/**
 * The partnership's money, worked out the same way on every screen. Pure: the terms and
 * the lead in, each partner's share out. All amounts are before VAT.
 *
 * The order is the agreement's (Yaniv and Dudu, 2026-10-08): what the customer pays, minus
 * the subcontractor, materials and travel, minus the working partner's days at the day rate
 * ("days" mode) — and what is left is split half and half. In "percent" mode nobody's days
 * are paid, so on a job one partner does by hand he takes the bigger share instead.
 */

export interface Terms {
  /** The day the partnership started ("2026-10-05"). */
  startDate: string | null;
  /** "days": the working partner's days come off first, then 50/50. "percent": no days, the executor takes `executorPct`. */
  mode: "days" | "percent";
  /** One working day, before VAT. Required in "days" mode. */
  dayRate: number | null;
  /** "percent" mode, a job a partner does himself: his share of what is left. */
  executorPct: number;
  /** Days of notice to end the partnership. */
  noticeDays: number;
  /** Days the collector has to pass the other partner his share, from the day the customer paid. */
  settleDays: number;
}

export interface PartnershipData {
  terms: Terms;
  /** user id → when they approved THIS version of the terms. */
  approvals: Record<string, string>;
  updatedAt: string;
  updatedBy: string;
  log: { at: string; who: string; text: string }[];
}

export const SUB = "sub";

export interface Split {
  /** The customer's price before VAT. */
  revenue: number;
  sub: number;
  materials: number;
  /** The working partner's days at the day rate ("days" mode only). */
  labor: number;
  /** What is left to split. */
  pot: number;
  /** user id → his total from this job (his days + his share). */
  due: Record<string, number>;
}

/** Why a job's split cannot be worked out yet, in the words the card shows — or null when it can. */
export function missing(d: Deal, terms: Terms): string | null {
  if (d.clientPrice == null) return "המחיר ללקוח";
  if (!d.executor) return "מי מבצע";
  if (d.executor === SUB && d.subPrice == null) return "המחיר לקבלן המשנה";
  if (d.executor !== SUB && terms.mode === "days") {
    if (terms.dayRate == null) return "התעריף היומי בהסכם";
    if (d.workDays == null) return "ימי העבודה";
  }
  return null;
}

export function split(d: Deal, terms: Terms, people: string[]): Split | null {
  if (missing(d, terms)) return null;
  const revenue = net(d.clientPrice!, d.clientVat);
  const sub = d.subPrice != null ? net(d.subPrice, d.subVat) : 0;
  const materials = d.materials ?? 0;
  const active = d.executor !== SUB;
  const labor = active && terms.mode === "days" ? (d.workDays ?? 0) * (terms.dayRate ?? 0) : 0;
  const pot = revenue - sub - materials - labor;
  const due: Record<string, number> = {};
  for (const p of people) {
    const mine = active && terms.mode === "percent" ? (p === d.executor ? terms.executorPct : 100 - terms.executorPct) / 100 : 1 / people.length;
    due[p] = pot * mine + (p === d.executor ? labor : 0);
  }
  return { revenue, sub, materials, labor, pot, due };
}

/**
 * Where a job's money stands. Once the customer has paid, the partner who collected holds it
 * all: he pays the subcontractor and the materials and owes the other partner his share.
 */
export type MoneyState =
  | { kind: "open" } // no price agreed yet
  | { kind: "closed" } // the customer approved, not paid yet
  | { kind: "owed"; from: string; to: string; amount: number; dueBy: string; late: boolean }
  | { kind: "settled"; on: string };

export function moneyState(l: Lead, s: Split | null, terms: Terms, today: string): MoneyState {
  const d = l.deal;
  if (d.settledAt) return { kind: "settled", on: d.settledAt };
  if (!d.paidAt || !d.collectedBy || !s) return d.closedAt ? { kind: "closed" } : { kind: "open" };
  const to = Object.keys(s.due).find((p) => p !== d.collectedBy)!;
  const dueBy = addDays(d.paidAt, terms.settleDays);
  return { kind: "owed", from: d.collectedBy, to, amount: s.due[to], dueBy, late: today > dueBy };
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The partnership's jobs: every lead with a price the customer approved. */
export function jobs(leads: Lead[]): Lead[] {
  return leads.filter((l) => l.deal.closedAt).sort((a, b) => a.deal.closedAt!.localeCompare(b.deal.closedAt!));
}

/** Net of everything paid and not yet settled: who owes whom, after the debts in both directions cancel out. */
export function balance(states: MoneyState[]): { from: string; to: string; amount: number } | null {
  const owes: Record<string, number> = {};
  for (const s of states) {
    if (s.kind !== "owed") continue;
    owes[`${s.from}>${s.to}`] = (owes[`${s.from}>${s.to}`] ?? 0) + s.amount;
  }
  const pairs = Object.entries(owes);
  if (!pairs.length) return null;
  const [a, b] = pairs[0][0].split(">");
  const n = (owes[`${a}>${b}`] ?? 0) - (owes[`${b}>${a}`] ?? 0);
  if (Math.abs(n) < 1) return null;
  return n > 0 ? { from: a, to: b, amount: n } : { from: b, to: a, amount: -n };
}
