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
