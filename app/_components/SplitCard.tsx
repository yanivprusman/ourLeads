"use client";
import { useState } from "react";
import { shekel, shortDay, daysFromToday, type BoardData, type Lead } from "./types";
import { SUB, missing, moneyState, split } from "./split";

/**
 * The partnership's side of a job: who does it, his days, materials, when the customer
 * approved and paid — and from that, what each partner gets and who owes whom.
 * Shown once there is a price for the customer; the terms come from the agreement screen.
 */
export default function SplitCard({
  lead,
  data,
  busy,
  onSave,
}: {
  lead: Lead;
  data: BoardData;
  busy: boolean;
  onSave: (b: Record<string, unknown>) => Promise<boolean>;
}) {
  const d = lead.deal;
  const terms = data.partnership.terms;
  const people = data.people;
  const name = (id: string) => (id === data.me.id ? "אני" : (people.find((p) => p.id === id)?.name ?? id));
  const s = split(d, terms, people.map((p) => p.id));
  const why = missing(d, terms);
  const state = moneyState(lead, s, terms, daysFromToday(0));
  const active = d.executor && d.executor !== SUB;

  if (d.clientPrice == null) return null;

  return (
    <div className="bg-white rounded-2xl border border-line overflow-hidden">
      <div className="flex items-center px-4 pt-3">
        <h3 className="font-bold text-sm text-ink-2">החלוקה בשותפות</h3>
        <span className="ms-auto text-xs text-muted">{terms.mode === "days" ? "ימי עבודה ואז חצי חצי" : `בלי ימי עבודה · מבצע ${terms.executorPct}%`}</span>
      </div>

      <div className="p-4 space-y-3">
        <Row label="מי מבצע">
          <Segmented
            id="split-executor"
            value={d.executor}
            disabled={busy}
            options={[{ v: SUB, label: "קבלן משנה" }, ...people.map((p) => ({ v: p.id, label: p.name }))]}
            onPick={(v) => onSave({ executor: v === d.executor ? null : v })}
          />
        </Row>
        {active && terms.mode === "days" && (
          <Row label="ימי עבודה">
            <NumberField key={`d${d.workDays}`} id="split-work-days" value={d.workDays} suffix="ימים" step="0.5" disabled={busy} onSave={(v) => onSave({ workDays: v })} />
          </Row>
        )}
        <Row label="חומרים ונסיעות">
          <NumberField key={`m${d.materials}`} id="split-materials" value={d.materials} prefix="₪" suffix="לפני מע״מ" disabled={busy} onSave={(v) => onSave({ materials: v })} />
        </Row>
        <Row label="הלקוח אישר">
          <DateField id="split-closed" value={d.closedAt} disabled={busy} onSave={(v) => onSave({ closedAt: v })} todayLabel="אישר היום" />
        </Row>
      </div>

      <div className="border-t border-line bg-paper px-4 py-3">
        {s ? (
          <>
            <p className="text-xs text-muted tabular-nums leading-relaxed">
              {shekel(s.revenue)}
              {s.sub > 0 && ` − קבלן ${shekel(s.sub)}`}
              {s.materials > 0 && ` − חומרים ${shekel(s.materials)}`}
              {s.labor > 0 && ` − ${d.workDays} ימי עבודה של ${name(d.executor!)} ${shekel(s.labor)}`} = <b className="text-ink-2">{shekel(s.pot)}</b> לחלוקה
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {people.map((p) => (
                <div key={p.id} className="rounded-xl bg-white border border-line px-3 py-2">
                  <div className="text-xs text-muted">{p.id === data.me.id ? `לי (${p.name})` : `ל${p.name}`}</div>
                  <div className={`text-xl font-extrabold tabular-nums ${s.due[p.id] < 0 ? "text-[#9b1c1c]" : ""}`}>{shekel(s.due[p.id])}</div>
                  {p.id === d.executor && s.labor > 0 && <div className="text-[11px] text-muted">כולל {shekel(s.labor)} ימי עבודה</div>}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">כדי לחשב את החלוקה חסר: {why}</p>
        )}
      </div>

      {d.closedAt && (
        <div className="border-t border-line p-4 space-y-3">
          <Row label="הלקוח שילם">
            <DateField id="split-paid" value={d.paidAt} disabled={busy} onSave={(v) => onSave({ paidAt: v, ...(v && !d.collectedBy ? { collectedBy: data.me.id } : {}) })} todayLabel="שילם היום" />
          </Row>
          {d.paidAt && (
            <Row label="לחשבון של">
              <Segmented
                id="split-collected-by"
                value={d.collectedBy}
                disabled={busy}
                options={people.map((p) => ({ v: p.id, label: p.name }))}
                onPick={(v) => onSave({ collectedBy: v })}
              />
            </Row>
          )}
          {state.kind === "owed" && (
            <div className={`rounded-xl px-3 py-2.5 flex items-center gap-3 ${state.late ? "bg-[#fde8e8] text-[#9b1c1c]" : "bg-amber-soft text-[#8a4a0b]"}`}>
              <p className="text-sm flex-1">
                <b>{name(state.from)}</b> מעביר ל<b>{name(state.to)}</b> <b className="tabular-nums">{shekel(state.amount)}</b>
                <br />
                <span className="text-xs">{state.late ? `באיחור — היה צריך עד ${shortDay(state.dueBy)}` : `עד ${shortDay(state.dueBy)} (${terms.settleDays} ימים מהתשלום)`}</span>
              </p>
              <button
                data-id="split-settle"
                disabled={busy}
                onClick={() => onSave({ settledAt: daysFromToday(0) })}
                className="rounded-xl bg-harbour text-white px-3 py-2 text-sm font-semibold hover:bg-harbour-2 cursor-pointer transition disabled:opacity-40 disabled:cursor-wait"
              >
                הועבר
              </button>
            </div>
          )}
          {state.kind === "settled" && (
            <div className="rounded-xl bg-[#ecf8f3] text-[#0b5c47] px-3 py-2.5 flex items-center text-sm">
              <span>✓ החלק הועבר ב{shortDay(state.on)}</span>
              <button data-id="split-unsettle" disabled={busy} onClick={() => onSave({ settledAt: null })} className="ms-auto text-xs underline hover:no-underline cursor-pointer disabled:opacity-40">
                בטל
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-sm text-ink-2 w-28 shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function Segmented({
  id,
  value,
  options,
  disabled,
  onPick,
}: {
  id: string;
  value: string | null;
  options: { v: string; label: string }[];
  disabled: boolean;
  onPick: (v: string) => void;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-full bg-paper p-1 text-sm" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          data-id={`${id}-${o.v}`}
          disabled={disabled}
          onClick={() => onPick(o.v)}
          className={`rounded-full px-3.5 py-1.5 cursor-pointer transition disabled:opacity-50 disabled:cursor-wait ${value === o.v ? "bg-white shadow font-semibold text-ink" : "text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A number saved when the field is left (or Enter) — empty saves "none". */
function NumberField({
  id,
  value,
  prefix,
  suffix,
  step,
  disabled,
  onSave,
}: {
  id: string;
  value: number | null;
  prefix?: string;
  suffix?: string;
  step?: string;
  disabled: boolean;
  onSave: (v: number | null) => void;
}) {
  const [v, setV] = useState(value == null ? "" : String(value));
  const commit = () => {
    const n = v.trim() === "" ? null : Number(v);
    if (n !== null && !Number.isFinite(n)) return;
    if (n !== value) onSave(n);
  };
  return (
    <label className="inline-flex items-center rounded-xl border border-line focus-within:border-harbour-2 px-3 bg-white">
      {prefix && <span className="text-muted">{prefix}</span>}
      <input
        data-id={id}
        value={v}
        disabled={disabled}
        inputMode="decimal"
        step={step}
        onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        placeholder="—"
        className="w-20 px-2 py-2 outline-none font-semibold tabular-nums bg-transparent disabled:opacity-50"
      />
      {suffix && <span className="text-xs text-muted">{suffix}</span>}
    </label>
  );
}

function DateField({ id, value, disabled, todayLabel, onSave }: { id: string; value: string | null; disabled: boolean; todayLabel: string; onSave: (v: string | null) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!value && (
        <button
          data-id={`${id}-today`}
          disabled={disabled}
          onClick={() => onSave(daysFromToday(0))}
          className="rounded-full bg-harbour/10 text-harbour px-3 py-1.5 text-sm font-semibold hover:bg-harbour/20 cursor-pointer transition disabled:opacity-50 disabled:cursor-wait"
        >
          {todayLabel}
        </button>
      )}
      <input
        data-id={`${id}-date`}
        type="date"
        disabled={disabled}
        value={value ?? ""}
        onChange={(e) => onSave(e.target.value || null)}
        className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm outline-none cursor-pointer disabled:opacity-50"
      />
      {value && (
        <button data-id={`${id}-clear`} disabled={disabled} onClick={() => onSave(null)} className="text-xs text-muted hover:text-ink underline cursor-pointer disabled:opacity-50">
          נקה
        </button>
      )}
    </div>
  );
}
