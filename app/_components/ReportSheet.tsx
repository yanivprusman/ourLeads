"use client";
import { useEffect, useState } from "react";
import SendTextButtons, { type TextTarget } from "./SendTextButtons";
import RecentSends from "./RecentSends";
import ClearPreview from "./ClearPreview";

/**
 * The report as WhatsApp text (lib/cardText.ts reportText): pick which leads go
 * in (all by default), read it here, send it to the preview group to see it as
 * Dudu will, then send it to Dudu. What is shown is exactly what is sent — the
 * server builds both from the same selection.
 */
interface Choice {
  id: number;
  title: string;
  group: string;
}

export default function ReportSheet({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [parts, setParts] = useState<string[] | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  /** null = every open lead (also any that arrive while the sheet is open). */
  const [picked, setPicked] = useState<Set<number> | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const ids = picked ? [...picked].sort((a, b) => a - b) : null;
  const idsKey = ids ? ids.join(",") : "";
  const none = picked !== null && picked.size === 0;

  useEffect(() => {
    if (none) return;
    let alive = true;
    fetch(`/api/report${idsKey ? `?ids=${idsKey}` : ""}`)
      .then(async (r) => {
        const b = await r.json();
        if (!alive) return;
        if (!r.ok) return setError(b.error ?? `HTTP ${r.status}`);
        setError(null);
        setParts(b.parts);
        setChoices(b.choices);
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [version, idsKey, none]);

  async function send(to: TextTarget): Promise<string | null> {
    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids ? { to, ids } : { to }),
    });
    const body = await res.json();
    if (!res.ok) return body.error ?? `HTTP ${res.status}`;
    // What was sent is the board as of now — refresh the preview so it matches.
    setVersion((v) => v + 1);
    onChanged();
    return null;
  }

  const isOn = (id: number) => picked === null || picked.has(id);
  function toggle(id: number) {
    const next = new Set(picked ?? choices.map((c) => c.id));
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next.size === choices.length ? null : next);
  }
  const count = picked === null ? choices.length : picked.size;
  const groups = [...new Set(choices.map((c) => c.group))];

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-ink/40" onClick={onClose}>
      <div className="w-full sm:max-w-lg bg-paper rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[92dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">דוח לידים</h3>
          <button data-id="report-close" onClick={onClose} className="size-9 rounded-full hover:bg-white text-xl cursor-pointer transition" aria-label="סגירה">
            ×
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-line">
          <button
            data-id="report-pick-toggle"
            onClick={() => setPicking(!picking)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold cursor-pointer hover:bg-paper rounded-2xl transition"
          >
            <span>
              לידים בדוח: {count} מתוך {choices.length}
            </span>
            <span className="text-muted">{picking ? "▲" : "בחירה ▼"}</span>
          </button>
          {picking && (
            <div className="border-t border-line max-h-56 overflow-y-auto px-2 pb-2">
              <div className="flex gap-2 px-2 py-2 text-xs">
                <button data-id="report-pick-all" onClick={() => setPicked(null)} className="rounded-full px-3 py-1 border border-line hover:border-harbour-2 cursor-pointer transition">
                  הכל
                </button>
                <button data-id="report-pick-none" onClick={() => setPicked(new Set())} className="rounded-full px-3 py-1 border border-line hover:border-harbour-2 cursor-pointer transition">
                  אף אחד
                </button>
              </div>
              {groups.map((g) => (
                <div key={g}>
                  <p className="px-2 pt-1 text-[11px] font-bold text-muted">{g}</p>
                  {choices
                    .filter((c) => c.group === g)
                    .map((c) => (
                      <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg hover:bg-paper cursor-pointer transition">
                        <input data-id="report-pick-lead" type="checkbox" checked={isOn(c.id)} onChange={() => toggle(c.id)} className="size-4 accent-harbour cursor-pointer" />
                        <span className="truncate">{c.title}</span>
                      </label>
                    ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
          {none ? (
            <p className="text-sm text-muted">לא נבחרו לידים.</p>
          ) : (
            <>
              {!parts && !error && <p className="text-sm text-muted">טוען…</p>}
              {parts?.map((p, i) => (
                <pre key={i} className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed bg-[#e7f6e9] rounded-2xl rounded-se-sm p-3 border border-line">
                  {p}
                </pre>
              ))}
            </>
          )}
        </div>

        {error ? <p className="text-red-700 text-sm">{error}</p> : parts && !none && <SendTextButtons idPrefix="report" what="הדוח" send={send} resetKey={idsKey} />}
        <RecentSends refreshKey={version} onChanged={onChanged} />
        <ClearPreview onDone={() => setVersion((v) => v + 1)} />
      </div>
    </div>
  );
}
