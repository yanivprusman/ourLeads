import "server-only";
import { readFileSync } from "node:fs";

/**
 * Everything ourLeads needs from its environment, read in one place and
 * refused loudly when missing. There are no defaults for anything that decides
 * where data lives or who may read it: a board that quietly wrote somewhere
 * else, or let anyone in, would look like it was working.
 */

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is not set (see .env.local)`);
  return v;
}

/** Where the SQLite file and the downloaded media live. */
export function dataDir(): string {
  return required("OURLEADS_DATA_DIR");
}

/**
 * Whether THIS server reads the WhatsApp chats. Dev and prod share one board
 * (one OURLEADS_DATA_DIR), so exactly one of them may turn messages into leads —
 * two readers would process every message twice. A switch flipped by hand, not a
 * failover: "dev looks broken, let prod take over" is a guess, and a wrong guess
 * leaves both reading. Normally prod (finished code); dev while working on
 * extraction. `OURLEADS_INGEST=on|off`, no default.
 */
export function ingestEnabled(): boolean {
  const v = required("OURLEADS_INGEST");
  if (v !== "on" && v !== "off") throw new Error(`OURLEADS_INGEST must be "on" or "off", got "${v}"`);
  return v === "on";
}

export interface User {
  id: string;
  name: string;
  token: string;
}

/**
 * The ball can also be in the customer's hands: we are waiting on him (a price to think over,
 * photos to send, a date to confirm). Then nobody owns the next move until `check_back_at`,
 * when it becomes BOTH partners' move — whoever reaches him first takes the ball back.
 */
export const CUSTOMER = { id: "customer", name: "הלקוח" } as const;

/**
 * The business line's assistant took over Dudu's part when he left (2026-10-10): the first
 * talk with the customer, collecting the job. So it is a place the ball can be — "the
 * assistant is on it" — like the customer, and not a user: it has no login and no share.
 */
export const ASSISTANT = { id: "assistant", name: "העוזר" } as const;

/** Days we give the customer when the ball is passed to him without a date. */
export const CUSTOMER_DAYS = 3;

/**
 * The people who may use the board. `OURLEADS_USERS` is a JSON object
 * `{ "<id>": { "name": "<shown name>", "token": "<secret>" } }`.
 *
 * Each person holds their own secret, so the history can say WHO changed a
 * lead — on a board two partners share, "someone moved it to lost" is the
 * sentence that starts the argument.
 */
export function users(): User[] {
  const raw = required("OURLEADS_USERS");
  let parsed: Record<string, { name?: string; token?: string }>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("OURLEADS_USERS is not valid JSON");
  }
  const list = Object.entries(parsed).map(([id, u]) => ({
    id,
    name: String(u.name ?? "").trim(),
    token: String(u.token ?? "").trim(),
  }));
  for (const u of list) {
    if (u.id === CUSTOMER.id || u.id === ASSISTANT.id || u.id === "nobody")
      throw new Error(`OURLEADS_USERS may not use the id "${u.id}" — it is a place the ball can be, not a person`);
    if (!u.name || u.token.length < 24)
      throw new Error(`OURLEADS_USERS.${u.id} needs a name and a token of at least 24 characters`);
  }
  if (list.length === 0) throw new Error("OURLEADS_USERS lists nobody");
  return list;
}

/**
 * Where a lead belongs: Yaniv's two lines of work, under his brand ג.ח. פרוייקטים —
 * work at height, and pigeons and windows (the same split as the business line's
 * alert groups, lib/cloud.ts LINES). Shown as the board's source filter.
 *
 * Leads in them came from Dudu's two WhatsApp chats (his businesses בסיס and
 * סנפלינג ישראל) until he left on 2026-10-10; those chats are no longer read. `jid`
 * stays so his chat is never taken for a customer's (lib/customerChats.ts), and
 * `actor` names him on the old messages in a lead's history. The ids stay because
 * leads carry them.
 */
export interface Source {
  id: string;
  jid: string;
  label: string;
  /** Who wrote the old messages from this chat, as a lead's history names them. */
  actor: string;
  trades: string;
}

export const SOURCES: Source[] = [
  {
    id: "basis",
    jid: "972533325272@s.whatsapp.net",
    label: "ג.ח. עבודות גובה",
    actor: "דודו",
    trades: "שיפוץ מעטפת: שיקום בטון, איטום קירות חיצוניים, חיזוק אריחים, צביעה, מרזבים, אינסטלציה חיצונית, תליית שלטים, פירוק אנטנות וכל עבודה בגובה סביב הבניין",
  },
  {
    id: "israel",
    jid: "972525407778@s.whatsapp.net",
    label: "ג.ח. יונים וחלונות",
    actor: "סנפלינג ישראל",
    trades: "הרחקת יונים וניקוי חלונות",
  },
];

/**
 * The brand a lead is shown under. A business-line lead (source "business",
 * lib/assistant.ts BUSINESS_SOURCE) goes under the brand of its kind of work, which the
 * assistant classifies (`line`); not classified yet = work at height, the same default
 * its alert uses. The stored source is untouched — the business line's code finds its
 * leads by it.
 */
export function brandOf(lead: { source: string; line: string | null }): string {
  if (lead.source !== "business") return lead.source;
  return lead.line === "pigeons_windows" ? "israel" : "basis";
}

/**
 * Where a shared lead card is opened. Always prod, even when the link is made on
 * dev: the card goes to people who have no dev access (a subcontractor),
 * and both servers read the one shared board, so the token is valid on either.
 */
export const CARD_ORIGIN = "https://our-leads.prod.ya-niv.com";

/** Only messages at or after this instant are ever read in. */
export function ingestSince(): string {
  return required("OURLEADS_INGEST_SINCE");
}

export interface BridgeConfig {
  apiUrl: string;
  token: string;
}

/**
 * Where lead text (one card, or the report of every open lead — lib/cardText.ts)
 * can be sent, readable in the chat itself — no link to open.
 *
 * - `preview`: Yaniv's own group "קבוצה ריקה". Read it there first, then forward
 *   it to whoever needs it (a subcontractor).
 *
 * Dudu's chat was the second target until he left (2026-10-10).
 * Nobody else: a message in someone's chat is Yaniv's word, so each recipient is
 * a decision written here, not a phone number typed into a form.
 */
export const TEXT_TARGETS = {
  preview: { jid: "120363427371815253@g.us", label: "קבוצה ריקה" },
} as const;
export type TextTarget = keyof typeof TEXT_TARGETS;
export const isTextTarget = (v: unknown): v is TextTarget => typeof v === "string" && Object.hasOwn(TEXT_TARGETS, v);

/**
 * The one linked WhatsApp bridge lives on the leader. This app READS it —
 * through the authenticated /api/dbquery and /api/download endpoints — and
 * sends lead text to `TEXT_TARGETS` and nowhere else.
 */
export function bridge(): BridgeConfig {
  const file = required("OURLEADS_BRIDGE_CONFIG");
  let cfg: { api_url?: string; token?: string };
  try {
    cfg = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`cannot read the bridge config ${file}: ${(e as Error).message}`);
  }
  if (!cfg.api_url || !cfg.token) throw new Error(`${file} must contain api_url and token`);
  return { apiUrl: cfg.api_url, token: cfg.token };
}
