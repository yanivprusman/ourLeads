import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { CUSTOMER, CUSTOMER_DAYS, dataDir } from "./config";

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
    -- Sign-in links that have been used. A link is a key: the first browser to use
    -- it gets the session, and every later use is refused, so a forwarded or leaked
    -- link is already dead. Shared by dev and prod (one data dir).
    CREATE TABLE IF NOT EXISTS used_links (
      sig TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      exp INTEGER NOT NULL,
      used_at TEXT NOT NULL
    );
    -- A lead card sent outside the board (lib/shares.ts): the link carries this
    -- random token, and what the sender chose to hide lives here, not in the URL,
    -- so whoever holds the link cannot ask for more.
    CREATE TABLE IF NOT EXISTS shares (
      token TEXT PRIMARY KEY,
      lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      hide TEXT NOT NULL DEFAULT '[]',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS shares_lead ON shares(lead_id);
    -- Lead text the app sent to WhatsApp (lib/cardText.ts), by a hash of the exact
    -- message. When the ingest later reads that message in a partner chat it knows
    -- it is ours: sent there directly (already logged) or forwarded from the preview
    -- group (log it then) — and never extracted as a new lead either way.
    CREATE TABLE IF NOT EXISTS sent_texts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      kind TEXT NOT NULL,
      lead_ids TEXT NOT NULL,
      sent_by TEXT NOT NULL,
      sent_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sent_texts_hash ON sent_texts(hash);
    -- The partnership's terms (lib/partnership.ts): one row, the terms as JSON, and who has
    -- approved this exact version. Any change clears the approvals — a term nobody agreed to
    -- must not look agreed.
    CREATE TABLE IF NOT EXISTS partnership_terms (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      terms TEXT NOT NULL,
      approvals TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    );
    -- Small switches both servers read (one data dir): today only the assistant's busy mode.
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    );
    -- Every change to the terms and every approval, so "I never agreed to that" has an answer.
    CREATE TABLE IF NOT EXISTS partnership_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      who TEXT NOT NULL,
      text TEXT NOT NULL
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
    // Whose hands the ball is in — a user id from OURLEADS_USERS, or null for nobody yet.
    ["holder", "TEXT"],
    // holder = "customer": the day ("2026-10-09") both partners should check back with him.
    ["check_back_at", "TEXT"],
    // The last time either of us opened it. Not an edit, so it never touches updated_at — only "last touched first" reads it.
    ["viewed_at", "TEXT"],
    // The partnership's money on a job (lib/split.ts reads it, with the terms in partnership_terms).
    // Materials, equipment and travel, before VAT — paid before anything is split.
    ["materials", "REAL"],
    // Who does the work: "sub" (a subcontractor — nobody's days), or a user id (that partner's days count).
    ["executor", "TEXT"],
    // That partner's working days on it.
    ["work_days", "REAL"],
    // The day the customer approved the price ("2026-10-06"). A job closed while the partnership
    // stood is split by its terms even if the work or the money comes after the partners part.
    ["closed_at", "TEXT"],
    // The day the customer paid, and the user id whose account the money went into.
    ["paid_at", "TEXT"],
    ["collected_by", "TEXT"],
    // The day the collector passed the other partner his share. Paid but not settled = owed.
    ["settled_at", "TEXT"],
    // A change the customer's own chat suggests (lib/proposal.ts) — a status, with its meeting/work
    // dates or price — waiting for one of us to confirm. JSON, null = nothing waiting.
    ["proposal", "TEXT"],
    // Business line only (lib/assistant.ts): pigeons_windows | building — which alert group hears about it.
    ["line", "TEXT"],
  ])
    if (!cols.has(name)) db.exec(`ALTER TABLE leads ADD COLUMN ${name} ${type}`);
  // Whether a photo shows the customer's phone number (lib/photoPhones.ts): none | partial | full, null = not looked at yet.
  const msgCols = new Set((db.prepare("PRAGMA table_info(messages)").all() as { name: string }[]).map((c) => c.name));
  if (!msgCols.has("phone_shown")) db.exec("ALTER TABLE messages ADD COLUMN phone_shown TEXT");
  // The business line (lib/cloud.ts): Meta's id for a message's media, fetched when the chat is read;
  // and who wrote it — the customer's WhatsApp name, or for from_me "assistant" / the partner who answered by hand.
  if (!msgCols.has("media_ref")) db.exec("ALTER TABLE messages ADD COLUMN media_ref TEXT");
  if (!msgCols.has("written_by")) db.exec("ALTER TABLE messages ADD COLUMN written_by TEXT");
  // sent_texts, later: the WhatsApp id of each sent message (so it can be deleted for
  // everyone), the send it belongs to (a report is two messages, deleted together),
  // and when it was deleted.
  // events, later: a history line can be corrected or taken out by hand. Neither
  // erases it — the board is shared by two partners, so a removed line stays in
  // the table with who removed it, and an edited one says who changed it.
  const evCols = new Set((db.prepare("PRAGMA table_info(events)").all() as { name: string }[]).map((c) => c.name));
  for (const name of ["edited_at", "edited_by", "deleted_at", "deleted_by"])
    if (!evCols.has(name)) db.exec(`ALTER TABLE events ADD COLUMN ${name} TEXT`);
  const sentCols = new Set((db.prepare("PRAGMA table_info(sent_texts)").all() as { name: string }[]).map((c) => c.name));
  for (const name of ["message_id", "batch", "target", "deleted_at"])
    if (!sentCols.has(name)) db.exec(`ALTER TABLE sent_texts ADD COLUMN ${name} TEXT`);
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

/** True for the first caller with this link, false for every one after — atomic. */
export function claimLink(sig: string, userId: string, exp: number): boolean {
  const r = getDb()
    .prepare("INSERT OR IGNORE INTO used_links (sig, user_id, exp, used_at) VALUES (?, ?, ?, ?)")
    .run(sig, userId, exp, now());
  return Number(r.changes) === 1;
}

export function linkUsed(sig: string): boolean {
  return !!getDb().prepare("SELECT 1 FROM used_links WHERE sig = ?").get(sig);
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
  /** The user id (OURLEADS_USERS) whose move it is; null = nobody has taken it yet. */
  holder: string | null;
  /** Only while holder = "customer": the day both partners check back with him ("2026-10-09"). */
  check_back_at: string | null;
  materials: number | null;
  executor: string | null;
  work_days: number | null;
  closed_at: string | null;
  paid_at: string | null;
  collected_by: string | null;
  settled_at: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  viewed_at: string | null;
  /** JSON of a `Proposal` (lib/proposal.ts) waiting for confirmation, or null. */
  proposal: string | null;
  /** Business line only: pigeons_windows | building (lib/cloud.ts LINES); null = not known yet. */
  line: string | null;
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
  phone_shown: "none" | "partial" | "full" | null;
  /** Business line only: Meta's media id, until the file is fetched. */
  media_ref: string | null;
  /** Business line: the customer's WhatsApp name; from_me: "assistant", or the partner who answered by hand. */
  written_by: string | null;
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
  edited_at: string | null;
  edited_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

/** Correct a history line's text. Returns false for no such (live) line. */
export function editEvent(id: number, text: string, who: string): boolean {
  return (
    getDb().prepare("UPDATE events SET text = ?, edited_at = ?, edited_by = ? WHERE id = ? AND deleted_at IS NULL").run(text, now(), who, id).changes > 0
  );
}

/** Take a history line off the lead (kept in the table, marked with who and when). */
export function deleteEvent(id: number, who: string): boolean {
  return getDb().prepare("UPDATE events SET deleted_at = ?, deleted_by = ? WHERE id = ? AND deleted_at IS NULL").run(now(), who, id).changes > 0;
}

/** Someone opened the lead. */
export function markViewed(id: number): boolean {
  return getDb().prepare("UPDATE leads SET viewed_at = ? WHERE id = ?").run(now(), id).changes > 0;
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
  materials?: number | null;
  executor?: string | null;
  work_days?: number | null;
  closed_at?: string | null;
  paid_at?: string | null;
  collected_by?: string | null;
  settled_at?: string | null;
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
  "materials",
  "executor",
  "work_days",
  "closed_at",
  "paid_at",
  "collected_by",
  "settled_at",
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

/** Today in Israel, "2026-10-06". */
export function israelToday(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jerusalem" }).slice(0, 10);
}

/** `days` after an Israel date, as an Israel date. */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The customer has had his time: it is both partners' move now. */
export function customerDue(l: Pick<LeadRow, "holder" | "check_back_at">): boolean {
  return l.holder === CUSTOMER.id && !!l.check_back_at && l.check_back_at <= israelToday();
}

/**
 * Pass the ball: the lead is now in `holder`'s hands until they pass it back.
 * Logged as "הכדור: יניב ← העוזר" so the history says who handed it over and when.
 *
 * `holder.id === "customer"` means we wait for him until `checkBack` (default: CUSTOMER_DAYS
 * from today); then it is both partners' move. Passing it to the customer again only moves the date.
 */
export function setHolder(
  id: number,
  who: string,
  holder: { id: string; name: string } | null,
  fromName: string | null,
  checkBack: string | null = null,
): void {
  const lead = getLead(id);
  if (!lead) throw new Error(`no lead #${id}`);
  const toCustomer = holder?.id === CUSTOMER.id;
  const until = toCustomer ? (checkBack ?? (lead.holder === CUSTOMER.id && lead.check_back_at ? lead.check_back_at : addDays(israelToday(), CUSTOMER_DAYS))) : null;
  if ((lead.holder ?? null) === (holder?.id ?? null) && (lead.check_back_at ?? null) === until) return;
  getDb().prepare("UPDATE leads SET holder = ?, check_back_at = ?, updated_at = ? WHERE id = ?").run(holder?.id ?? null, until, now(), id);
  if ((lead.holder ?? null) === (holder?.id ?? null))
    addEvent(id, who, "holder", `בודקים שוב עם הלקוח ב${sayDate(until!)}`);
  else
    addEvent(id, who, "holder", `הכדור: ${fromName ?? "אף אחד"} ← ${holder?.name ?? "אף אחד"}${until ? ` · בודקים איתו שוב ב${sayDate(until)}` : ""}`);
}

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
/** "יום חמישי 9.10" */
function sayDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `יום ${DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}.${m}`;
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
