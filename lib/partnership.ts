import "server-only";
import { getDb, now } from "./db";
import { users } from "./config";
import type { PartnershipData, Terms } from "@/app/_components/split";

/**
 * The partnership agreement the board works by. One version at a time: whoever changes a
 * term proposes the new version (and has approved it by proposing it); the other partner
 * approves it with a tap. A changed term clears every approval, so the screen never shows
 * an "agreed" term that only one of them saw.
 */

/** Where the terms start before anyone has written them — the day rate is left empty on purpose: it is theirs to name. */
const START: Terms = { startDate: "2026-10-05", mode: "days", dayRate: null, executorPct: 70, noticeDays: 14, settleDays: 7 };

interface Row {
  terms: string;
  approvals: string;
  updated_at: string;
  updated_by: string;
}

export function partnership(): PartnershipData {
  const d = getDb();
  const row = d.prepare("SELECT terms, approvals, updated_at, updated_by FROM partnership_terms WHERE id = 1").get() as unknown as Row | undefined;
  const log = d.prepare("SELECT at, who, text FROM partnership_log ORDER BY id DESC LIMIT 50").all() as unknown as PartnershipData["log"];
  if (!row) return { terms: START, approvals: {}, updatedAt: "", updatedBy: "", log };
  return { terms: { ...START, ...JSON.parse(row.terms) }, approvals: JSON.parse(row.approvals), updatedAt: row.updated_at, updatedBy: row.updated_by, log };
}

function addLog(who: string, text: string) {
  getDb().prepare("INSERT INTO partnership_log (at, who, text) VALUES (?, ?, ?)").run(now(), who, text);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate a change from a client. Throws with the reason the form shows. */
export function cleanTerms(body: Record<string, unknown>, base: Terms): Terms {
  const t = { ...base };
  const num = (k: string, min: number, max: number) => {
    if (body[k] === null || body[k] === "") return null;
    const n = Number(body[k]);
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${k} must be a number from ${min} to ${max}`);
    return n;
  };
  if ("startDate" in body) {
    if (body.startDate !== null && !(typeof body.startDate === "string" && DATE.test(body.startDate))) throw new Error("startDate must be YYYY-MM-DD");
    t.startDate = body.startDate as string | null;
  }
  if ("mode" in body) {
    if (body.mode !== "days" && body.mode !== "percent") throw new Error('mode must be "days" or "percent"');
    t.mode = body.mode;
  }
  if ("dayRate" in body) t.dayRate = num("dayRate", 1, 100_000);
  for (const [k, min, max] of [
    ["executorPct", 50, 100],
    ["noticeDays", 0, 365],
    ["settleDays", 0, 90],
  ] as const) {
    if (!(k in body)) continue;
    const n = num(k, min, max);
    if (n == null) throw new Error(`${k} is required`);
    t[k] = n;
  }
  return t;
}

/** "תעריף יומי: — ← ₪1,200" for each term that changed. */
function describe(before: Terms, after: Terms): string[] {
  const shown = (k: keyof Terms, v: Terms[keyof Terms]) =>
    v == null ? "—" : k === "dayRate" ? `₪${Number(v).toLocaleString("en-US")}` : k === "mode" ? (v === "days" ? "ימי עבודה ואז חצי חצי" : "בלי ימי עבודה, אחוזים למבצע") : k === "executorPct" ? `${v}%` : String(v);
  const labels: Record<keyof Terms, string> = {
    startDate: "תחילת השת״פ",
    mode: "שיטת החלוקה",
    dayRate: "תעריף יומי",
    executorPct: "חלק המבצע",
    noticeDays: "הודעה מראש (ימים)",
    settleDays: "העברת חלק (ימים)",
  };
  return (Object.keys(labels) as (keyof Terms)[]).filter((k) => before[k] !== after[k]).map((k) => `${labels[k]}: ${shown(k, before[k])} ← ${shown(k, after[k])}`);
}

export function setTerms(user: { id: string; name: string }, body: Record<string, unknown>): PartnershipData {
  const cur = partnership();
  const next = cleanTerms(body, cur.terms);
  const changes = describe(cur.terms, next);
  if (!changes.length) return cur;
  getDb()
    .prepare(
      `INSERT INTO partnership_terms (id, terms, approvals, updated_at, updated_by) VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET terms = excluded.terms, approvals = excluded.approvals, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .run(JSON.stringify(next), JSON.stringify({ [user.id]: now() }), now(), user.id);
  addLog(user.name, `שינה את ההסכם — ${changes.join(" · ")}. האישורים התאפסו; ${user.name} מאשר את הגרסה החדשה.`);
  return partnership();
}

/** `user` approves the version on screen. `version` is its updatedAt, so an approval never lands on terms changed meanwhile. */
export function approve(user: { id: string; name: string }, version: string): PartnershipData {
  const cur = partnership();
  if (!cur.updatedAt) throw new Error("אין עדיין הסכם לאשר — קודם ממלאים את התנאים");
  if (version !== cur.updatedAt) throw new Error("ההסכם השתנה בינתיים — תסתכל שוב לפני שאתה מאשר");
  if (cur.approvals[user.id]) return cur;
  const approvals = { ...cur.approvals, [user.id]: now() };
  getDb().prepare("UPDATE partnership_terms SET approvals = ? WHERE id = 1").run(JSON.stringify(approvals));
  const all = users().every((u) => approvals[u.id]);
  addLog(user.name, all ? `${user.name} אישר — ההסכם מאושר על ידי שני הצדדים.` : `${user.name} אישר את ההסכם.`);
  return partnership();
}
