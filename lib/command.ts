import "server-only";
import { askJson } from "./claude";
import { SOURCES } from "./config";
import { STATUS_GUIDE, describeLeads } from "./ingest";
import { STATUS_LABELS, addEvent, getDb, getLead, isStatus, now, updateLead } from "./db";
import { DEAL_KEYS, describeDeal } from "./deal";

/**
 * "Talk to it and say the status."
 *
 * A sentence — spoken and transcribed, or typed — is matched against the open
 * leads and turned into changes: a status, a visit date, a next step, a note.
 * The reply says back exactly what was changed, so a misheard name is caught
 * the moment it happens rather than when the lead goes missing.
 */

export interface AppliedChange {
  leadId: number;
  title: string;
  from: string | null;
  to: string | null;
  note: string | null;
  created?: boolean;
}

export interface CommandResult {
  said: string;
  reply: string;
  changes: AppliedChange[];
}

interface Answer {
  changes?: {
    leadId: number;
    status?: string | null;
    note?: string | null;
    nextStep?: string | null;
    visitAt?: string | null;
    phones?: string[];
    customerName?: string | null;
    clientPrice?: number | null;
    clientVat?: boolean | null;
    subName?: string | null;
    subPhone?: string | null;
    subPrice?: number | null;
    subVat?: boolean | null;
  }[];
  create?: {
    source: string;
    title: string;
    trade?: string | null;
    customerName?: string | null;
    phones?: string[];
    address?: string | null;
    city?: string | null;
    details?: string | null;
    status?: string | null;
  }[];
  reply: string;
}

const s = { type: ["string", "null"] };
const COMMAND_SCHEMA = {
  type: "object",
  properties: {
    changes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          leadId: { type: "integer" },
          status: s,
          note: s,
          nextStep: s,
          visitAt: s,
          customerName: s,
          phones: { type: "array", items: { type: "string" } },
          clientPrice: { type: ["number", "null"] },
          clientVat: { type: ["boolean", "null"] },
          subName: s,
          subPhone: s,
          subPrice: { type: ["number", "null"] },
          subVat: { type: ["boolean", "null"] },
        },
        required: ["leadId"],
      },
    },
    create: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source: { type: "string" },
          title: { type: "string" },
          trade: s,
          customerName: s,
          phones: { type: "array", items: { type: "string" } },
          address: s,
          city: s,
          details: s,
          status: s,
        },
        required: ["source", "title"],
      },
    },
    reply: { type: "string" },
  },
  required: ["changes", "create", "reply"],
};

function buildPrompt(said: string, who: string): string {
  return `אתה מנהל לוח לידים לשותפות עבודות גובה. ${who} אמר/ה עכשיו (תמלול של הקלטה, ייתכנו שגיאות שמיעה):
"""${said}"""

לידים פתוחים:
${describeLeads()}

סטטוסים אפשריים: ${STATUS_GUIDE}.
מקורות לידים: ${SOURCES.map((s) => `${s.id} = ${s.label} (${s.trades})`).join("; ")}.

הבן לאיזה ליד או לידים הדברים מתייחסים — לפי שם לקוח, עיר, סוג עבודה או מספר ליד — ומה השתנה.
דוגמאות: "דיברתי עם אורן מרעננה, לא רלוונטי" → status lost על הליד של אורן.
"קבעתי עם אנטולי לחמישי בעשר" → status visit_scheduled, visitAt "חמישי 10:00".
"שלחתי הצעה לשי 3500" → status quoted, note "הצעה 3,500 ₪".
עסקה — שני צדדים: מה הלקוח משלם (clientPrice) ומה מקבל קבלן המשנה שמבצע (subName, subPhone, subPrice).
"סגרנו עם הלקוח ב-8000 פלוס מע"מ" → clientPrice 8000, clientVat true. "כולל מע"מ" → clientVat false.
"סגרנו עם יונתן 050-1234567 על 5000 פלוס מע"מ" כשיונתן הוא מי שמבצע → subName "יונתן", subPhone "0501234567", subPrice 5000, subVat true.
אם לא ברור אם האדם הוא הלקוח או קבלן המשנה — שאל ב-reply ואל תנחש.
סגירה עם הלקוח → status won.
אם נאמר ליד חדש שלא קיים בלוח — הוסף אותו ב-create.
note: משפט קצר בגוף שלישי שמתעד מה נאמר, כולל מחירים ותאריכים.
אם לא ברור לאיזה ליד הכוונה — אל תשנה כלום, ושאל ב-reply שאלה קצרה.
reply: משפט אחד או שניים בעברית, שאומר בדיוק מה עודכן (שם הליד והסטטוס החדש).

התשובה במבנה:
{"changes":[{"leadId":1,"status":"visit_scheduled","note":"...","nextStep":null,"visitAt":"..."}],
 "create":[{"source":"basis","title":"...","trade":null,"customerName":null,"phones":[],"address":null,"city":null,"details":null,"status":"new"}],
 "reply":"..."}`;
}

export async function runCommand(said: string, who: string): Promise<CommandResult> {
  const text = said.trim();
  if (!text) throw new Error("nothing was said");
  const d = getDb();
  let answer: Answer;
  try {
    answer = await askJson<Answer>(buildPrompt(text, who), COMMAND_SCHEMA);
  } catch (e) {
    d.prepare("INSERT INTO commands (at, who, said, error) VALUES (?, ?, ?, ?)").run(now(), who, text, (e as Error).message);
    throw e;
  }

  const applied: AppliedChange[] = [];
  for (const c of answer.changes ?? []) {
    const before = getLead(c.leadId);
    if (!before) continue;
    const patch: Record<string, unknown> = {};
    if (c.nextStep !== undefined && c.nextStep !== null) patch.next_step = c.nextStep;
    if (c.visitAt !== undefined && c.visitAt !== null) patch.visit_at = c.visitAt;
    if (c.phones?.length) patch.phones = Array.from(new Set([...JSON.parse(before.phones), ...c.phones]));
    if (c.customerName) patch.customer_name = c.customerName;
    if (c.clientPrice != null) patch.client_price = c.clientPrice;
    if (c.clientVat != null) patch.client_vat = c.clientVat ? 1 : 0;
    if (c.subName) patch.sub_name = c.subName;
    if (c.subPhone) patch.sub_phone = c.subPhone.replace(/\D/g, "").replace(/^972/, "0");
    if (c.subPrice != null) patch.sub_price = c.subPrice;
    if (c.subVat != null) patch.sub_vat = c.subVat ? 1 : 0;
    const status = isStatus(c.status) ? c.status : null;
    const after = updateLead(c.leadId, who, patch, status, c.note ?? text);
    if (DEAL_KEYS.some((k) => k in patch)) addEvent(c.leadId, who, "deal", describeDeal(after));
    applied.push({
      leadId: after.id,
      title: after.title,
      from: STATUS_LABELS[before.status],
      to: status && status !== before.status ? STATUS_LABELS[status] : null,
      note: c.note ?? null,
    });
  }
  for (const c of answer.create ?? []) {
    const src = SOURCES.find((s) => s.id === c.source) ?? null;
    if (!src || !c.title) continue;
    const status = isStatus(c.status) ? c.status : "new";
    const t = now();
    const r = d
      .prepare(
        `INSERT INTO leads (source, title, trade, customer_name, phones, address, city, details, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(src.id, c.title, c.trade ?? null, c.customerName ?? null, JSON.stringify(c.phones ?? []), c.address ?? null, c.city ?? null, c.details ?? null, status, t, t);
    const id = Number(r.lastInsertRowid);
    addEvent(id, who, "created", `נוסף בקול: ${text}`, null, status);
    applied.push({ leadId: id, title: c.title, from: null, to: STATUS_LABELS[status], note: null, created: true });
  }

  const reply = answer.reply || (applied.length ? "עודכן." : "לא הבנתי לאיזה ליד הכוונה.");
  d.prepare("INSERT INTO commands (at, who, said, reply, changes) VALUES (?, ?, ?, ?, ?)").run(
    now(),
    who,
    text,
    reply,
    JSON.stringify(applied),
  );
  return { said: text, reply, changes: applied };
}
