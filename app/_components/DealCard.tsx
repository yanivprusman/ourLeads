"use client";
import { useState } from "react";
import { PhoneIcon } from "./Board";
import { margin, net, prettyPhone, shekel, type Deal } from "./types";

/**
 * The money on a lead: what the client pays, and what the subcontractor who does the
 * job gets. The difference is what stays with the partnership — shown before VAT,
 * because one side is often quoted "+ מע״מ" and the other "כולל".
 */
export default function DealCard({
  deal,
  busy,
  onSave,
}: {
  deal: Deal;
  busy: boolean;
  onSave: (d: Partial<Record<keyof Deal, string | number | boolean | null>>) => Promise<boolean>;
}) {
  const empty = deal.clientPrice == null && deal.subPrice == null && !deal.subName;
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(() => toForm(deal));
  const m = margin(deal);

  if (editing)
    return (
      <form
        className="bg-white rounded-2xl border-2 border-harbour-2/40 p-4 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await onSave({
            clientPrice: f.clientPrice.trim() || null,
            clientVat: f.clientPrice.trim() ? f.clientVat : null,
            subName: f.subName.trim() || null,
            subPhone: f.subPhone.trim() || null,
            subPrice: f.subPrice.trim() || null,
            subVat: f.subPrice.trim() ? f.subVat : null,
          });
          if (ok) setEditing(false);
        }}
      >
        <h3 className="font-bold">העסקה</h3>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-ink-2 mb-1">מול הלקוח</legend>
          <PriceInput id="deal-client-price" value={f.clientPrice} onChange={(v) => setF({ ...f, clientPrice: v })} />
          <VatSwitch id="deal-client-vat" value={f.clientVat} onChange={(v) => setF({ ...f, clientVat: v })} />
        </fieldset>
        <fieldset className="space-y-2 pt-3 border-t border-line">
          <legend className="text-sm font-semibold text-ink-2 mb-1">מול קבלן המשנה</legend>
          <div className="grid grid-cols-2 gap-2">
            <input
              data-id="deal-sub-name"
              value={f.subName}
              onChange={(e) => setF({ ...f, subName: e.target.value })}
              placeholder="שם"
              className="rounded-xl border border-line px-3 py-2.5 outline-none focus:border-harbour-2"
            />
            <input
              data-id="deal-sub-phone"
              value={f.subPhone}
              onChange={(e) => setF({ ...f, subPhone: e.target.value })}
              placeholder="טלפון"
              inputMode="tel"
              dir="ltr"
              className="rounded-xl border border-line px-3 py-2.5 outline-none focus:border-harbour-2 text-end"
            />
          </div>
          <PriceInput id="deal-sub-price" value={f.subPrice} onChange={(v) => setF({ ...f, subPrice: v })} />
          <VatSwitch id="deal-sub-vat" value={f.subVat} onChange={(v) => setF({ ...f, subVat: v })} />
        </fieldset>
        <div className="flex gap-2 pt-1">
          <button
            data-id="deal-save"
            disabled={busy}
            className="flex-1 rounded-xl bg-harbour text-white py-3 font-semibold hover:bg-harbour-2 cursor-pointer transition disabled:opacity-40 disabled:cursor-wait"
          >
            שמור עסקה
          </button>
          <button
            type="button"
            data-id="deal-cancel"
            onClick={() => {
              setF(toForm(deal));
              setEditing(false);
            }}
            className="rounded-xl px-5 border border-line text-muted hover:text-ink hover:bg-paper cursor-pointer transition"
          >
            ביטול
          </button>
        </div>
      </form>
    );

  if (empty)
    return (
      <button
        data-id="deal-add"
        onClick={() => setEditing(true)}
        className="w-full rounded-2xl border-2 border-dashed border-line py-4 text-muted hover:border-harbour-2 hover:text-harbour hover:bg-white cursor-pointer transition font-semibold"
      >
        + סגרתם? הוסיפו מחיר ללקוח ולקבלן המשנה
      </button>
    );

  return (
    <div className="bg-white rounded-2xl border border-line overflow-hidden">
      <div className="flex items-center px-4 pt-3">
        <h3 className="font-bold text-sm text-ink-2">העסקה</h3>
        <button
          data-id="deal-edit"
          onClick={() => {
            setF(toForm(deal));
            setEditing(true);
          }}
          className="ms-auto text-sm text-harbour hover:underline cursor-pointer"
        >
          עריכה
        </button>
      </div>
      <div className="grid grid-cols-2 divide-x divide-x-reverse divide-line">
        <Side title="מהלקוח" price={deal.clientPrice} vat={deal.clientVat} />
        <Side title="לקבלן המשנה" price={deal.subPrice} vat={deal.subVat}>
          {(deal.subName || deal.subPhone) && (
            <div className="mt-1.5 text-sm">
              {deal.subName && <span className="font-semibold">{deal.subName}</span>}
              {deal.subPhone && (
                <a
                  data-id="deal-sub-call"
                  href={`tel:${deal.subPhone}`}
                  className="flex items-center gap-1 text-harbour hover:underline cursor-pointer"
                  dir="ltr"
                >
                  {prettyPhone(deal.subPhone)} <PhoneIcon className="size-3.5" />
                </a>
              )}
            </div>
          )}
        </Side>
      </div>
      <div className={`px-4 py-3 border-t border-line flex items-baseline gap-2 ${m == null ? "bg-paper" : m >= 0 ? "bg-[#ecf8f3]" : "bg-[#fde8e8]"}`}>
        <span className="text-sm text-ink-2">נשאר לנו</span>
        {m == null ? (
          <span className="text-sm text-muted">— חסר {deal.clientPrice == null ? "המחיר ללקוח" : "המחיר לקבלן המשנה"}</span>
        ) : (
          <>
            <b className={`text-xl tabular-nums ${m >= 0 ? "text-[#0b5c47]" : "text-[#9b1c1c]"}`}>{shekel(m)}</b>
            <span className="text-xs text-muted">לפני מע״מ</span>
          </>
        )}
      </div>
    </div>
  );
}

function Side({ title, price, vat, children }: { title: string; price: number | null; vat: boolean | null; children?: React.ReactNode }) {
  return (
    <div className="p-4">
      <div className="text-xs text-muted">{title}</div>
      {price == null ? (
        <div className="text-muted mt-1">—</div>
      ) : (
        <>
          <div className="text-2xl font-extrabold tabular-nums mt-0.5">{shekel(price)}</div>
          <div className="text-xs text-muted">
            {vat === true ? "+ מע״מ" : vat === false ? `כולל מע״מ · ${shekel(net(price, false))} לפני` : "מע״מ לא צוין"}
          </div>
        </>
      )}
      {children}
    </div>
  );
}

function PriceInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center rounded-xl border border-line focus-within:border-harbour-2 px-3">
      <span className="text-muted">₪</span>
      <input
        data-id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        inputMode="numeric"
        placeholder="סכום"
        className="flex-1 px-2 py-2.5 outline-none text-lg font-semibold tabular-nums bg-transparent"
      />
    </div>
  );
}

function VatSwitch({ id, value, onChange }: { id: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="inline-flex rounded-full bg-paper p-1 text-sm" role="radiogroup">
      {[
        { v: true, label: "+ מע״מ" },
        { v: false, label: "כולל מע״מ" },
      ].map((o) => (
        <button
          key={o.label}
          type="button"
          data-id={`${id}-${o.v ? "plus" : "incl"}`}
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-full px-3.5 py-1.5 cursor-pointer transition ${value === o.v ? "bg-white shadow font-semibold text-ink" : "text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function toForm(d: Deal) {
  return {
    clientPrice: d.clientPrice != null ? String(Math.round(d.clientPrice)) : "",
    clientVat: d.clientVat ?? true,
    subName: d.subName ?? "",
    subPhone: d.subPhone ?? "",
    subPrice: d.subPrice != null ? String(Math.round(d.subPrice)) : "",
    subVat: d.subVat ?? true,
  };
}
