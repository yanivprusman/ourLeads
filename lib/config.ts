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
    if (u.id === CUSTOMER.id) throw new Error(`OURLEADS_USERS may not use the id "${CUSTOMER.id}" — it means the customer holds the ball`);
    if (!u.name || u.token.length < 24)
      throw new Error(`OURLEADS_USERS.${u.id} needs a name and a token of at least 24 characters`);
  }
  if (list.length === 0) throw new Error("OURLEADS_USERS lists nobody");
  return list;
}

/**
 * The WhatsApp chats leads arrive from. Each entry names the partner on the
 * other end and the trades that are theirs — the split Dudu set on 2026-10-05:
 * building and facade work goes to Basis, pigeons and windows to סנפלינג ישראל.
 *
 * "ישראל" here is part of a business name, not a person: nobody called Israel
 * is in this partnership. So a source carries an explicit `actor` (the name an
 * event is signed with) instead of taking the first word of `partner`.
 */
export interface Source {
  id: string;
  jid: string;
  label: string;
  /** Who is on the other end of the chat, as the extractor should call them. */
  partner: string;
  /** The name an event from this chat is signed with on a lead's timeline. */
  actor: string;
  trades: string;
}

export const SOURCES: Source[] = [
  {
    id: "basis",
    jid: "972533325272@s.whatsapp.net",
    label: "בסיס",
    partner: "דודו (בסיס עבודות בגובה)",
    actor: "דודו",
    trades: "שיפוץ מעטפת: שיקום בטון, איטום קירות חיצוניים, חיזוק אריחים, צביעה, מרזבים, אינסטלציה חיצונית, תליית שלטים, פירוק אנטנות וכל עבודה בגובה סביב הבניין",
  },
  {
    id: "israel",
    jid: "972525407778@s.whatsapp.net",
    label: "סנפלינג ישראל",
    partner: "העסק סנפלינג ישראל (שם של חברה, לא של אדם)",
    actor: "סנפלינג ישראל",
    trades: "הרחקת יונים וניקוי חלונות",
  },
];

/**
 * Where a shared lead card is opened. Always prod, even when the link is made on
 * dev: the card goes to people who have no dev access (Dudu, a subcontractor),
 * and both servers read the one shared board, so the token is valid on either.
 */
export const CARD_ORIGIN = "https://our-leads.prod.ya-niv.com";

export function sourceByJid(jid: string): Source | undefined {
  return SOURCES.find((s) => s.jid === jid);
}

/** Only messages at or after this instant are ever read in. */
export function ingestSince(): string {
  return required("OURLEADS_INGEST_SINCE");
}

export interface BridgeConfig {
  apiUrl: string;
  token: string;
}

/**
 * The one linked WhatsApp bridge lives on the leader. This app only READS it —
 * through the authenticated /api/dbquery and /api/download endpoints — and
 * never sends: leads come in, nothing goes out in anyone's name.
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
