"use client";
import { useState } from "react";
import { daysFromToday, shekel, shortDay, type BoardData } from "./types";
import { SUB, balance, jobs, moneyState, split, type MoneyState, type Terms } from "./split";

/**
 * The agreement the board works by, and where the money stands under it. Both partners
 * see the same screen: the terms and who approved them, the rules, every job the
 * customer approved with each one's share, and the one number that matters — who owes whom.
 */
export default function PartnershipView({ data, onOpen, onChanged }: { data: BoardData; onOpen: (id: number) => void; onChanged: () => void }) {
  const p = data.partnership;
  const terms = p.terms;
  const people = data.people;
  const ids = people.map((x) => x.id);
  const today = daysFromToday(0);
  const name = (id: string) => (id === data.me.id ? "אתה" : (people.find((x) => x.id === id)?.name ?? id));
  const list = jobs(data.leads).map((l) => {
    const s = split(l.deal, terms, ids);
    return { l, s, state: moneyState(l, s, terms, today) };
  });
  const bal = balance(list.map((j) => j.state));
  const totals: Record<string, number> = {};
  for (const j of list) if (j.s) for (const id of ids) totals[id] = (totals[id] ?? 0) + j.s.due[id];
  const late = list.filter((j) => j.state.kind === "owed" && j.state.late).length;

  return (
    <div className="space-y-3">
      <div className={`rounded-2xl px-4 py-4 ${bal ? (bal.to === data.me.id ? "bg-[#ecf8f3] text-[#0b5c47]" : "bg-amber-soft text-[#8a4a0b]") : "bg-white border border-line"}`}>
        <div className="text-xs opacity-80">מה פתוח בינינו</div>
        {bal ? (
          <p className="text-lg font-bold mt-0.5">
            {bal.from === data.me.id ? `אתה מעביר ל${name(bal.to)}` : `${name(bal.from)} מעביר לך`} <span className="tabular-nums">{shekel(bal.amount)}</span>
          </p>
        ) : (
          <p className="text-lg font-bold mt-0.5">אין חובות פתוחים</p>
        )}
        {late > 0 && <p className="text-sm mt-1 font-semibold text-[#9b1c1c]">{late === 1 ? "עבודה אחת באיחור" : `${late} עבודות באיחור`} בהעברה</p>}
      </div>

      <TermsCard data={data} onChanged={onChanged} />

      <section className="bg-white rounded-2xl border border-line overflow-hidden">
        <h3 className="font-bold text-sm text-ink-2 px-4 pt-3 pb-2">העבודות של השותפות</h3>
        {list.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted">עוד אין עבודות. עבודה נכנסת לכאן כשמסמנים בליד ״הלקוח אישר״.</p>
        ) : (
          <ul className="divide-y divide-line">
            {list.map(({ l, s, state }) => (
              <li key={l.id}>
                <button data-id={`partnership-job-${l.id}`} onClick={() => onOpen(l.id)} className="w-full text-start px-4 py-3 hover:bg-paper cursor-pointer transition">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold truncate">{l.title}</span>
                    <span className="ms-auto text-xs text-muted shrink-0">אושר {shortDay(l.deal.closedAt!)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="text-muted">{l.deal.executor === SUB ? "קבלן משנה" : l.deal.executor ? `מבצע ${people.find((x) => x.id === l.deal.executor)?.name}` : "מבצע —"}</span>
                    {s ? (
                      people.map((x) => (
                        <span key={x.id} className="tabular-nums">
                          {x.name} <b>{shekel(s.due[x.id])}</b>
                        </span>
                      ))
                    ) : (
                      <span className="text-muted">חסרים נתונים לחלוקה</span>
                    )}
                    <StatePill state={state} name={name} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {list.length > 0 && (
          <div className="border-t border-line bg-paper px-4 py-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="text-muted">סה״כ לפני מע״מ:</span>
            {people.map((x) => (
              <span key={x.id} className="tabular-nums">
                {x.name} <b>{shekel(totals[x.id] ?? 0)}</b>
              </span>
            ))}
          </div>
        )}
      </section>

      <Rules terms={terms} />

      {p.log.length > 0 && (
        <details className="bg-white rounded-2xl border border-line">
          <summary data-id="partnership-log-toggle" className="px-4 py-3 text-sm font-semibold text-ink-2 cursor-pointer hover:bg-paper rounded-2xl">
            היסטוריית ההסכם ({p.log.length})
          </summary>
          <ul className="px-4 pb-3 space-y-2 text-sm">
            {p.log.map((e, i) => (
              <li key={i} className="text-ink-2">
                <span className="text-xs text-muted">{new Date(e.at).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</span> {e.text}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function StatePill({ state, name }: { state: MoneyState; name: (id: string) => string }) {
  const [cls, text] =
    state.kind === "owed"
      ? [state.late ? "bg-[#fee2e2] text-[#991b1b]" : "bg-amber-soft text-[#8a4a0b]", `${name(state.from)} → ${name(state.to)} ${shekel(state.amount)}${state.late ? " · באיחור" : ""}`]
      : state.kind === "settled"
        ? ["bg-[#dcfce7] text-[#166534]", "הועבר ✓"]
        : ["bg-paper text-muted", "מחכה לתשלום"];
  return <span className={`ms-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{text}</span>;
}

function TermsCard({ data, onChanged }: { data: BoardData; onChanged: () => void }) {
  const p = data.partnership;
  const t = p.terms;
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(t);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approvedByAll = !!p.updatedAt && data.people.every((x) => p.approvals[x.id]);

  async function send(method: "PUT" | "POST", body: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/partnership", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? `HTTP ${res.status}`);
      return false;
    }
    onChanged();
    return true;
  }

  if (editing)
    return (
      <form
        className="bg-white rounded-2xl border-2 border-harbour-2/40 p-4 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await send("PUT", f)) setEditing(false);
        }}
      >
        <h3 className="font-bold">עריכת ההסכם</h3>
        <p className="text-xs text-muted">שמירה מאפסת את האישור של {data.people.filter((x) => x.id !== data.me.id).map((x) => x.name).join(", ")} — הוא יצטרך לאשר את הגרסה החדשה.</p>
        <Field label="תחילת השת״פ">
          <input data-id="terms-start-date" type="date" value={f.startDate ?? ""} onChange={(e) => setF({ ...f, startDate: e.target.value || null })} className="rounded-lg border border-line px-2 py-1.5" />
        </Field>
        <Field label="שיטת החלוקה">
          <div className="inline-flex flex-wrap rounded-full bg-paper p-1 text-sm">
            {(
              [
                ["days", "ימי עבודה ואז חצי חצי"],
                ["percent", "בלי ימי עבודה, אחוזים למבצע"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                data-id={`terms-mode-${v}`}
                onClick={() => setF({ ...f, mode: v })}
                className={`rounded-full px-3.5 py-1.5 cursor-pointer transition ${f.mode === v ? "bg-white shadow font-semibold text-ink" : "text-muted hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
        {f.mode === "days" ? (
          <Field label="תעריף יומי">
            <Num id="terms-day-rate" value={f.dayRate} prefix="₪" suffix="ליום, לפני מע״מ" onChange={(v) => setF({ ...f, dayRate: v })} />
          </Field>
        ) : (
          <Field label="חלק המבצע">
            <Num id="terms-executor-pct" value={f.executorPct} suffix="% (השאר לשותף)" onChange={(v) => setF({ ...f, executorPct: v ?? 70 })} />
          </Field>
        )}
        <Field label="העברת חלק">
          <Num id="terms-settle-days" value={f.settleDays} suffix="ימים מהתשלום" onChange={(v) => setF({ ...f, settleDays: v ?? 7 })} />
        </Field>
        <Field label="סיום">
          <Num id="terms-notice-days" value={f.noticeDays} suffix="ימי הודעה מראש" onChange={(v) => setF({ ...f, noticeDays: v ?? 14 })} />
        </Field>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button data-id="terms-save" disabled={busy} className="flex-1 rounded-xl bg-harbour text-white py-3 font-semibold hover:bg-harbour-2 cursor-pointer transition disabled:opacity-40 disabled:cursor-wait">
            שמור והצע לאישור
          </button>
          <button
            type="button"
            data-id="terms-cancel"
            onClick={() => {
              setF(t);
              setEditing(false);
            }}
            className="rounded-xl px-5 border border-line text-muted hover:text-ink hover:bg-paper cursor-pointer transition"
          >
            ביטול
          </button>
        </div>
      </form>
    );

  return (
    <section className="bg-white rounded-2xl border border-line overflow-hidden">
      <div className="flex items-center px-4 pt-3">
        <h3 className="font-bold text-sm text-ink-2">ההסכם</h3>
        <button
          data-id="terms-edit"
          onClick={() => {
            setF(t);
            setEditing(true);
          }}
          className="ms-auto text-sm text-harbour hover:underline cursor-pointer"
        >
          עריכה
        </button>
      </div>
      <ul className="px-4 py-3 space-y-1.5 text-[15px]">
        {t.startDate && <li>השת״פ התחיל ב-{shortDay(t.startDate)}.</li>}
        {t.mode === "days" ? (
          <li>
            מכל עבודה יורדים קבלן משנה, חומרים ונסיעות, וימי העבודה של המבצע לפי{" "}
            {t.dayRate ? <b className="tabular-nums">{shekel(t.dayRate)} ליום</b> : <b className="text-[#9b1c1c]">תעריף יומי שעוד לא נקבע</b>}. מה שנשאר — <b>חצי חצי</b>.
          </li>
        ) : (
          <li>
            מכל עבודה יורדים קבלן משנה, חומרים ונסיעות. בעבודה שקבלן משנה מבצע — <b>חצי חצי</b>. בעבודה ששותף מבצע בעצמו — <b>{t.executorPct}% למבצע</b>, {100 - t.executorPct}% לשותף.
          </li>
        )}
        <li>מי שגובה מעביר לשותף את חלקו תוך {t.settleDays} ימים מהתשלום.</li>
      </ul>
      <div className="border-t border-line px-4 py-3 flex flex-wrap items-center gap-2">
        {data.people.map((x) => (
          <span
            key={x.id}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${p.approvals[x.id] ? "bg-[#dcfce7] text-[#166534]" : "bg-paper text-muted"}`}
          >
            {p.approvals[x.id] ? `✓ ${x.name} אישר` : `${x.name} עוד לא אישר`}
          </span>
        ))}
        {p.updatedAt && !p.approvals[data.me.id] && (
          <button
            data-id="terms-approve"
            disabled={busy}
            onClick={() => send("POST", { approve: p.updatedAt })}
            className="ms-auto rounded-xl bg-harbour text-white px-4 py-2 text-sm font-semibold hover:bg-harbour-2 cursor-pointer transition disabled:opacity-40 disabled:cursor-wait"
          >
            אני מאשר
          </button>
        )}
        {!p.updatedAt && <span className="text-sm text-muted">ממלאים את התנאים ב״עריכה״ — ואז כל אחד מאשר.</span>}
        {approvedByAll && <span className="ms-auto text-sm font-semibold text-[#166534]">מאושר על ידי שניכם</span>}
      </div>
      {error && <p className="px-4 pb-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}

/** What holds whatever the numbers are — collection, ownership, and parting. */
function Rules({ terms }: { terms: Terms }) {
  return (
    <section className="bg-white rounded-2xl border border-line px-4 py-3">
      <h3 className="font-bold text-sm text-ink-2 mb-2">כללים</h3>
      <ul className="space-y-1.5 text-[15px] list-disc ps-5 marker:text-muted">
        <li>כל לקוח משלם רק כנגד חשבונית או לינק תשלום, לחשבון של מי שמבצע. כל תשלום נרשם כאן.</li>
        <li>תשלום שנגבה בדרך אחרת — כולו שייך לשותף השני.</li>
        <li>עבודה שהלקוח אישר בזמן השת״פ מתחלקת לפי ההסכם גם אם הביצוע או התשלום אחרי שנפרדים.</li>
        <li>כל צד יכול לסיים בהודעה של {terms.noticeDays} יום מראש. לידים פתוחים חוזרים למי שהביא אותם.</li>
      </ul>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-sm text-ink-2 w-28 shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function Num({ id, value, prefix, suffix, onChange }: { id: string; value: number | null; prefix?: string; suffix?: string; onChange: (v: number | null) => void }) {
  return (
    <label className="inline-flex items-center rounded-xl border border-line focus-within:border-harbour-2 px-3">
      {prefix && <span className="text-muted">{prefix}</span>}
      <input
        data-id={id}
        value={value ?? ""}
        inputMode="numeric"
        onChange={(e) => {
          const s = e.target.value.replace(/[^\d]/g, "");
          onChange(s ? Number(s) : null);
        }}
        placeholder="—"
        className="w-20 px-2 py-2 outline-none font-semibold tabular-nums bg-transparent"
      />
      {suffix && <span className="text-xs text-muted">{suffix}</span>}
    </label>
  );
}
