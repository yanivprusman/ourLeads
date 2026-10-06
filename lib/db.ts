import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { dataDir } from "./config";

/**
 * One SQLite file. The board is two people and a few leads a day; a database
 * server would be the largest part of the app.
 *
 * - `messages`: every WhatsApp message read in from a source chat, with what
 *   was made of it (transcript, local media file) and the lead it belongs to.
 * - `leads`: the cards.
 * - `events`: everything that ever happened to a lead, newest last — status
 *   changes, notes, who said what by voice. The card's status is the last word;
 *   this is how you find out who said it.
 */

/**
 * Where a lead stands — three states and a way out. A meeting or work can be
 * set with or without a date; the dates live on the calendar, not here.
 * Yaniv, 2026-10-06: "a simple tristate none meeting work" + a remove button.
 * The eight-step pipeline before it (חדש … בוצע) was more than anyone used.
 */
export const STATUSES = ["none", "meeting", "work", "removed"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  none: "ללא",
  meeting: "פגישה",
  work: "עבודה",
  removed: "הוסר",
};

/** Names of the old pipeline, so history written before 2026-10-06 still reads. */
export const LEGACY_STATUS_LABELS: Record<string, string> = {
  new: "חדש",
  contacted: "בקשר",
  visit_scheduled: "ביקור נקבע",
  quoted: "הצעה נשלחה",
  won: "נסגר",
  done: "בוצע",
  on_hold: "בהמתנה",
  lost: "ירד",
};

export function statusLabel(s: string): string {
  return STATUS_LABELS[s as Status] ?? LEGACY_STATUS_LABELS[s] ?? s;
}

/** Statuses a lead is finished in. Everything else is still on someone's plate. */
export const CLOSED: Status[] = ["removed"];

export function isStatus(s: unknown): s is Status {
  return typeof s === "string" && (STATUSES as readonly string[]).includes(s);
}

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  const dir = dataDir();
  mkdirSync(path.join(dir, "media"), { recursive: true });
  db = new DatabaseSync(path.join(dir, "ourleads.sqlite"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      trade TEXT,
      customer_name TEXT,
      phones TEXT NOT NULL DEFAULT '[]',
      address TEXT,
      city TEXT,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'none',
      next_step TEXT,
      visit_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_message_at TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      source TEXT NOT NULL,
      from_me INTEGER NOT NULL,
      sent_at TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      media_type TEXT NOT NULL DEFAULT '',
      media_file TEXT,
      transcript TEXT,
      lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
      state TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      PRIMARY KEY (id, chat_jid)
    );
    CREATE INDEX IF NOT EXISTS messages_lead ON messages(lead_id);
    CREATE INDEX IF NOT EXISTS messages_state ON messages(state, chat_jid);
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      at TEXT NOT NULL,
      who TEXT NOT NULL,
      kind TEXT NOT NULL,
      text TEXT,
      from_status TEXT,
      to_status TEXT
    );
    CREATE INDEX IF NOT EXISTS events_lead ON events(lead_id);
    CREATE TABLE IF NOT EXISTS commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      who TEXT NOT NULL,
      said TEXT NOT NULL,
      reply TEXT,
      changes TEXT NOT NULL DEFAULT '[]',
      error TEXT
    );
  `);
  // The deal: what the client pays, and what the subcontractor who does it gets.
  // Added after the first leads existed, so it is a migration, not part of CREATE.
  const cols = new Set((db.prepare("PRAGMA table_info(leads)").all() as { name: string }[]).map((c) => c.name));
  for (const [name, type] of [
    ["client_price", "REAL"],
    ["client_vat", "INTEGER"],
    ["sub_name", "TEXT"],
    ["sub_phone", "TEXT"],
    ["sub_price", "REAL"],
    ["sub_vat", "INTEGER"],
    // The calendar. Local Israel time, no zone: "2026-10-09T10:00" / "2026-10-12".
    ["meeting_at", "TEXT"],
    ["work_start", "TEXT"],
    ["work_end", "TEXT"],
  ])
    if (!cols.has(name)) db.exec(`ALTER TABLE leads ADD COLUMN ${name} ${type}`);
  // The old pipeline → the three states. Idempotent: rows already converted match no WHEN.
  db.exec(`
    UPDATE leads SET status = CASE
      WHEN status IN ('done', 'lost') THEN 'removed'
      WHEN status = 'won' OR work_start IS NOT NULL THEN 'work'
      WHEN status IN ('visit_scheduled', 'quoted') OR meeting_at IS NOT NULL THEN 'meeting'
      ELSE 'none' END
    WHERE status IN ('new', 'contacted', 'visit_scheduled', 'quoted', 'won', 'done', 'on_hold', 'lost');
  `);
  return db;
}

export function now(): string {
  return new Date().toISOString();
}

export interface LeadRow {
  id: number;
  source: string;
  title: string;
  trade: string | null;
  customer_name: string | null;
  phones: string;
  address: string | null;
  city: string | null;
  details: string | null;
  status: Status;
  next_step: string | null;
  visit_at: string | null;
  client_price: number | null;
  /** 1 = the price is before VAT (״+ מע״מ״), 0 = VAT included, null = not said. */
  client_vat: number | null;
  sub_name: string | null;
  sub_phone: string | null;
  sub_price: number | null;
  sub_vat: number | null;
  /** A meeting with a customer we have no contract with yet ("2026-10-09T10:00"). */
  meeting_at: string | null;
  /** The job itself, once there is a contract ("2026-10-12"). */
  work_start: string | null;
  work_end: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
}

export interface MessageRow {
  id: string;
  chat_jid: string;
  source: string;
  from_me: number;
  sent_at: string;
  content: string;
  media_type: string;
  media_file: string | null;
  transcript: string | null;
  lead_id: number | null;
  state: string;
  error: string | null;
}

export interface EventRow {
  id: number;
  lead_id: number;
  at: string;
  who: string;
  kind: string;
  text: string | null;
  from_status: string | null;
  to_status: string | null;
}

export function addEvent(
  leadId: number,
  who: string,
  kind: string,
  text: string | null,
  fromStatus: string | null = null,
  toStatus: string | null = null,
  at: string = now(),
): void {
  getDb()
    .prepare(
      "INSERT INTO events (lead_id, at, who, kind, text, from_status, to_status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(leadId, at, who, kind, text, fromStatus, toStatus);
}

/** Leads still on someone's plate, newest activity first — what the extractor
 *  and the voice command match against. */
export function openLeads(): LeadRow[] {
  const placeholders = CLOSED.map(() => "?").join(",");
  return getDb()
    .prepare(
      `SELECT * FROM leads WHERE status NOT IN (${placeholders})
       ORDER BY COALESCE(last_message_at, created_at) DESC LIMIT 60`,
    )
    .all(...CLOSED) as unknown as LeadRow[];
}

export function getLead(id: number): LeadRow | undefined {
  return getDb().prepare("SELECT * FROM leads WHERE id = ?").get(id) as unknown as LeadRow | undefined;
}

export interface LeadPatch {
  title?: string;
  trade?: string | null;
  customer_name?: string | null;
  phones?: string[];
  address?: string | null;
  city?: string | null;
  details?: string | null;
  next_step?: string | null;
  visit_at?: string | null;
  client_price?: number | null;
  client_vat?: number | null;
  sub_name?: string | null;
  sub_phone?: string | null;
  sub_price?: number | null;
  sub_vat?: number | null;
  meeting_at?: string | null;
  work_start?: string | null;
  work_end?: string | null;
}

const PATCHABLE: (keyof LeadPatch)[] = [
  "title",
  "trade",
  "customer_name",
  "phones",
  "address",
  "city",
  "details",
  "next_step",
  "visit_at",
  "client_price",
  "client_vat",
  "sub_name",
  "sub_phone",
  "sub_price",
  "sub_vat",
  "meeting_at",
  "work_start",
  "work_end",
];

/** Apply field changes and a status change, logging each as an event. */
const EDIT_LABELS = { title: "כותרת", trade: "עבודה", customer_name: "לקוח", address: "כתובת", city: "עיר", next_step: "הצעד הבא" } as const;

/** A corrected field leaves a line in the history: "עבודה: חיזוק אריחים ← איטום פסיפס". */
export function logFieldEdits(before: LeadRow, after: LeadRow, who: string): void {
  for (const [key, label] of Object.entries(EDIT_LABELS) as [keyof typeof EDIT_LABELS, string][]) {
    if (before[key] === after[key]) continue;
    addEvent(after.id, who, "note", `${label}: ${before[key] ?? "—"} ← ${after[key] ?? "—"}`);
  }
}

export function updateLead(
  id: number,
  who: string,
  patch: LeadPatch,
  status: Status | null,
  note: string | null,
): LeadRow {
  const d = getDb();
  const lead = getLead(id);
  if (!lead) throw new Error(`no lead #${id}`);
  // A date on the calendar says where the lead is: a meeting date means a meeting,
  // working dates mean work. Only ever moves a lead forward, never out of removed.
  if (!status) {
    if (patch.work_start && (lead.status === "none" || lead.status === "meeting")) status = "work";
    else if (patch.meeting_at && lead.status === "none") status = "meeting";
  }
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  for (const key of PATCHABLE) {
    if (!(key in patch)) continue;
    const v = patch[key];
    sets.push(`${key} = ?`);
    vals.push(key === "phones" ? JSON.stringify(v ?? []) : ((v as string | number | null) ?? null));
  }
  if (status && status !== lead.status) {
    sets.push("status = ?");
    vals.push(status);
  }
  if (sets.length) {
    sets.push("updated_at = ?");
    vals.push(now());
    d.prepare(`UPDATE leads SET ${sets.join(", ")} WHERE id = ?`).run(...vals, id);
  }
  if (status && status !== lead.status) addEvent(id, who, "status", note, lead.status, status);
  else if (note) addEvent(id, who, "note", note);
  return getLead(id)!;
}
