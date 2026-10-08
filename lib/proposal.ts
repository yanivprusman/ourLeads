import "server-only";
import { describeCalendar, describeDeal, sayWhen } from "./deal";
import { STATUS_LABELS, addEvent, getDb, getLead, now, updateLead, type LeadPatch, type LeadRow, type Status } from "./db";

/**
 * A change the customer's chat suggests, waiting for one of us to confirm.
 *
 * Reading a customer's words is a guess — "תודה, נדבר" can read as a goodbye.
 * Moving a lead off the board on a guess hides it from both partners, so the
 * customer's chat (lib/customerChats.ts) never changes a lead's status itself:
 * it adds what he said to the lead's history and leaves this proposal, and the
 * status moves only when one of us taps "אשר". A newer proposal replaces an
 * older one — the latest thing he said is what stands.
 */
export interface Proposal {
  status: Status | null;
  /** Dates and price that come with it: meeting_at, work_start/end, client_price/vat. */
  patch: LeadPatch;
  /** Why, in one sentence — what the customer said. */
  why: string;
  /** Who said it (the customer's name, or Yaniv when it was his own message). */
  who: string;
  at: string;
}

export function readProposal(l: Pick<LeadRow, "proposal">): Proposal | null {
  if (!l.proposal) return null;
  try {
    return JSON.parse(l.proposal) as Proposal;
  } catch {
    throw new Error(`lead proposal is not JSON: ${l.proposal.slice(0, 80)}`);
  }
}

/** What accepting it would do, in words: "פגישה · רביעי 14.10 10:00". */
export function describeProposal(p: Proposal): string {
  const parts: string[] = [];
  if (p.status) parts.push(STATUS_LABELS[p.status]);
  if (p.patch.meeting_at) parts.push(`פגישה ${sayWhen(p.patch.meeting_at)}`);
  if (p.patch.work_start)
    parts.push(`עבודה ${sayWhen(p.patch.work_start)}${p.patch.work_end && p.patch.work_end !== p.patch.work_start ? `–${sayWhen(p.patch.work_end)}` : ""}`);
  if (p.patch.client_price != null) parts.push(`${p.patch.client_price.toLocaleString("he-IL")} ₪`);
  return parts.join(" · ");
}

/** Leave a proposal on the lead, unless it would change nothing. Returns whether one was left. */
export function propose(leadId: number, p: Omit<Proposal, "at">, at: string = now()): boolean {
  const lead = getLead(leadId);
  if (!lead) throw new Error(`no lead #${leadId}`);
  const status = p.status && p.status !== lead.status ? p.status : null;
  const patch: LeadPatch = {};
  for (const [k, v] of Object.entries(p.patch) as [keyof LeadPatch, unknown][])
    if (v != null && lead[k as keyof LeadRow] !== v) (patch as Record<string, unknown>)[k] = v;
  if (!status && !Object.keys(patch).length) return false;
  getDb().prepare("UPDATE leads SET proposal = ? WHERE id = ?").run(JSON.stringify({ ...p, status, patch, at }), leadId);
  return true;
}

/** One of us confirmed or rejected it. Either way it is gone and the history says who decided. */
export function resolveProposal(leadId: number, who: string, accept: boolean): LeadRow {
  const lead = getLead(leadId);
  if (!lead) throw new Error(`no lead #${leadId}`);
  const p = readProposal(lead);
  if (!p) throw new Error(`lead #${leadId} has no proposal waiting`);
  const d = getDb();
  d.exec("BEGIN");
  try {
    d.prepare("UPDATE leads SET proposal = NULL WHERE id = ?").run(leadId);
    if (accept) {
      const after = updateLead(leadId, who, p.patch, p.status, `אישר: ${p.why}`);
      if (p.patch.meeting_at || p.patch.work_start) addEvent(leadId, who, "calendar", describeCalendar(after));
      if (p.patch.client_price != null) addEvent(leadId, who, "deal", describeDeal(after));
    } else {
      addEvent(leadId, who, "note", `לא אישר: ${describeProposal(p)} (${p.why})`);
    }
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  return getLead(leadId)!;
}
