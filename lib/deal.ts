import "server-only";
import type { LeadRow } from "./db";

/** "₪5,000 + מע״מ" — how a price is said in this trade, with or without VAT on top. */
export function money(n: number | null, vat: number | null): string | null {
  if (n == null) return null;
  const v = vat === 1 ? " + מע״מ" : vat === 0 ? " כולל מע״מ" : "";
  return `₪${Math.round(n).toLocaleString("en-US")}${v}`;
}

/** One line for the lead's history whenever the deal changes. */
export function describeDeal(l: LeadRow): string {
  const parts: string[] = [];
  const c = money(l.client_price, l.client_vat);
  if (c) parts.push(`מול הלקוח ${c}`);
  const s = money(l.sub_price, l.sub_vat);
  const who = [l.sub_name, l.sub_phone].filter(Boolean).join(" ");
  if (s || who) parts.push(`מול קבלן המשנה${who ? ` (${who})` : ""}${s ? ` ${s}` : ""}`);
  return parts.length ? `עסקה: ${parts.join(" · ")}` : "העסקה נמחקה";
}

export const DEAL_KEYS = ["client_price", "client_vat", "sub_name", "sub_phone", "sub_price", "sub_vat"] as const;

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/** "חמישי 9.10 10:00" from "2026-10-09T10:00" (local Israel time, no zone). */
export function sayWhen(local: string): string {
  const [d, t] = local.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const dow = DAYS[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
  return `${dow} ${day}.${m}${t ? ` ${t.slice(0, 5)}` : ""}`;
}

export function describeCalendar(l: LeadRow): string {
  const parts: string[] = [];
  if (l.meeting_at) parts.push(`פגישה ${sayWhen(l.meeting_at)}`);
  if (l.work_start) parts.push(`עבודה ${sayWhen(l.work_start)}${l.work_end && l.work_end !== l.work_start ? ` עד ${sayWhen(l.work_end)}` : ""}`);
  return parts.length ? `ביומן: ${parts.join(" · ")}` : "הוסר מהיומן";
}

export const CALENDAR_KEYS = ["meeting_at", "work_start", "work_end"] as const;

/** Today, in the words the extractor and the voice command need to resolve "Thursday". */
export function todayLine(): string {
  const now = new Date();
  const local = now.toLocaleString("sv-SE", { timeZone: "Asia/Jerusalem" }).replace(" ", "T").slice(0, 16);
  return `עכשיו: ${sayWhen(local)} (${local}), שעון ישראל.`;
}

const LOCAL_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const LOCAL_D = /^\d{4}-\d{2}-\d{2}$/;
export function cleanDateTime(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, 16);
  return LOCAL_DT.test(s) ? s : null;
}
export function cleanDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, 10);
  return LOCAL_D.test(s) ? s : null;
}
