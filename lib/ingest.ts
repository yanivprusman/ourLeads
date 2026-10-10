import "server-only";
import path from "node:path";
import { downloadMedia } from "./bridge";
import { ASSISTANT, CUSTOMER, dataDir, users } from "./config";
import { cleanDate, cleanDateTime, describeDeal, sayWhen } from "./deal";
import { transcribe } from "./transcribe";
import { classifyPhotos } from "./photoPhones";
import { processCustomerChats, pullCustomerChats } from "./customerChats";
import { processBusinessChats } from "./assistant";
import {
  STATUSES,
  STATUS_LABELS,
  getDb,
  openLeads,
  type LeadPatch,
  type MessageRow,
} from "./db";

/**
 * WhatsApp → leads.
 *
 * Every POLL_MS: customers' own chats (lib/customerChats.ts) and the business
 * line (lib/assistant.ts). Dudu's two chats were read here too — a burst of
 * voice notes and screenshots turned into leads by an extractor — until he left;
 * the reader was removed on 2026-10-10 (git history has it).
 *
 * The helpers below are shared by those readers: a chat's pending messages are
 * read only once it has been QUIET for QUIET_MS (people write in bursts — a photo,
 * then the address — and reading half-way makes two half-leads out of one).
 */
const POLL_MS = 20_000;
const QUIET_MS = 120_000;
const MAX_WAIT_MS = 8 * 60_000;
export const RETRY_MS = 5 * 60_000;
/** Messages re-read before the newest one we have, so a late-arriving message
 *  with an older timestamp (the bridge was reconnecting) is still caught. */
export const OVERLAP_MS = 30 * 60_000;

export const OWNER = "יניב";

let running = false;
const log = (...a: unknown[]) => console.log("[ourleads/ingest]", ...a);

export function startIngest(): void {
  const g = globalThis as unknown as { __ourleadsIngest?: NodeJS.Timeout };
  if (g.__ourleadsIngest) return;
  log("started: polling customers' chats and the business line");
  g.__ourleadsIngest = setInterval(() => void tick(), POLL_MS);
  void tick();
}

export async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await pullCustomerChats(log);
    await processCustomerChats(log);
    await processBusinessChats(log);
    await classifyPhotos(log);
  } catch (e) {
    log("tick failed:", (e as Error).message);
  } finally {
    running = false;
  }
}

/**
 * The part of a chat's pending messages that may be read now, or null to wait.
 * A chat in live conversation is never quiet for two minutes, so waiting for
 * quiet alone would hold a lead back for as long as the partners keep
 * talking. After MAX_WAIT_MS, everything older than QUIET_MS goes through.
 */
export function readyBatch(pending: MessageRow[]): MessageRow[] | null {
  const age = (m: MessageRow) => Date.now() - new Date(m.sent_at).getTime();
  if (age(pending[pending.length - 1]) >= QUIET_MS) return pending;
  if (age(pending[0]) < MAX_WAIT_MS) return null;
  return pending.filter((m) => age(m) >= QUIET_MS);
}

/** Download every pending message's media; transcribe voice notes. A failure
 *  is recorded on the message and does not stop the batch — a lead with one
 *  missing photo is better than no lead. */
export async function prepareMedia(msgs: MessageRow[]): Promise<void> {
  const d = getDb();
  const dir = path.join(dataDir(), "media");
  for (const m of msgs) {
    if (!m.media_type) continue;
    try {
      if (!m.media_file) {
        const name = await downloadMedia(m.id, m.chat_jid, m.media_type, "", dir);
        m.media_file = name;
        d.prepare("UPDATE messages SET media_file = ? WHERE id = ? AND chat_jid = ?").run(name, m.id, m.chat_jid);
      }
      // Checked separately from the download: a server restart between the two
      // must not leave a voice note downloaded and never heard.
      if (m.media_type === "audio" && m.transcript == null) {
        const text = await transcribe(path.join(dir, m.media_file));
        m.transcript = text;
        d.prepare("UPDATE messages SET transcript = ? WHERE id = ? AND chat_jid = ?").run(text, m.id, m.chat_jid);
      }
    } catch (e) {
      m.error = (e as Error).message;
      d.prepare("UPDATE messages SET error = ? WHERE id = ? AND chat_jid = ?").run(m.error, m.id, m.chat_jid);
      log(`media for ${m.id} failed:`, m.error);
    }
  }
}

export function israelTime(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function describeMessage(m: MessageRow, partner: string): string {
  const who = m.from_me ? OWNER : partner;
  const parts: string[] = [];
  if (m.media_type === "audio") parts.push(`[הקלטה קולית] תמלול: ${m.transcript ?? "(לא תומלל)"}`);
  else if (m.media_type === "image")
    parts.push(m.media_file ? `[תמונה: ${path.join(dataDir(), "media", m.media_file)}]` : "[תמונה שלא ירדה]");
  else if (m.media_type === "video") parts.push("[סרטון]");
  else if (m.media_type) parts.push(`[${m.media_type}]`);
  if (m.content) parts.push(m.content);
  return `<${m.id}> ${israelTime(m.sent_at)} ${who}: ${parts.join(" ") || "(ריק)"}`;
}

export function describeLeads(): string {
  const leads = openLeads();
  if (!leads.length) return "(אין לידים פתוחים)";
  const people = users();
  return leads
    .map((l) => {
      const phones = (JSON.parse(l.phones) as string[]).join(", ");
      return `#${l.id} [${STATUS_LABELS[l.status]}] ${l.title}` +
        (l.customer_name ? ` | לקוח: ${l.customer_name}` : "") +
        (phones ? ` | טל: ${phones}` : "") +
        (l.address || l.city ? ` | ${[l.address, l.city].filter(Boolean).join(", ")}` : "") +
        (l.meeting_at ? ` | פגישה: ${sayWhen(l.meeting_at)}` : l.visit_at ? ` | ביקור: ${l.visit_at}` : "") +
        (l.work_start ? ` | עבודה: ${sayWhen(l.work_start)}${l.work_end && l.work_end !== l.work_start ? `–${sayWhen(l.work_end)}` : ""}` : "") +
        (l.next_step ? ` | הבא: ${l.next_step}` : "") +
        (l.holder ? ` | אצל: ${[...people, ASSISTANT, CUSTOMER].find((u) => u.id === l.holder)?.name ?? l.holder}` : "") +
        (l.holder === CUSTOMER.id && l.check_back_at ? ` | בודקים איתו: ${sayWhen(l.check_back_at)}` : "") +
        (l.client_price != null || l.sub_price != null || l.sub_name ? ` | ${describeDeal(l)}` : "");
    })
    .join("\n");
}

export const STATUS_GUIDE = STATUSES.map((s) => `${s} = ${STATUS_LABELS[s]}`).join(", ");

export interface LeadFields {
  title?: string;
  trade?: string | null;
  customerName?: string | null;
  phones?: string[];
  address?: string | null;
  city?: string | null;
  details?: string | null;
  nextStep?: string | null;
  visitAt?: string | null;
  clientPrice?: number | null;
  clientVat?: boolean | null;
  subName?: string | null;
  subPhone?: string | null;
  subPrice?: number | null;
  subVat?: boolean | null;
  meetingAt?: string | null;
  workStart?: string | null;
  workEnd?: string | null;
}

export function toPatch(f: LeadFields): LeadPatch {
  const p: LeadPatch = {};
  if (f.title) p.title = f.title;
  if (f.trade !== undefined) p.trade = f.trade;
  if (f.customerName !== undefined) p.customer_name = f.customerName;
  if (f.phones !== undefined) p.phones = f.phones;
  if (f.address !== undefined) p.address = f.address;
  if (f.city !== undefined) p.city = f.city;
  if (f.details !== undefined) p.details = f.details;
  if (f.nextStep !== undefined) p.next_step = f.nextStep;
  if (f.visitAt !== undefined) p.visit_at = f.visitAt;
  if (f.clientPrice != null) p.client_price = f.clientPrice;
  if (f.clientVat != null) p.client_vat = f.clientVat ? 1 : 0;
  if (f.subName) p.sub_name = f.subName;
  if (f.subPhone) p.sub_phone = f.subPhone.replace(/\D/g, "").replace(/^972/, "0");
  if (f.subPrice != null) p.sub_price = f.subPrice;
  if (f.subVat != null) p.sub_vat = f.subVat ? 1 : 0;
  const meet = cleanDateTime(f.meetingAt);
  if (meet) p.meeting_at = meet;
  const ws = cleanDate(f.workStart);
  if (ws) {
    p.work_start = ws;
    p.work_end = cleanDate(f.workEnd) ?? ws;
  }
  return p;
}
