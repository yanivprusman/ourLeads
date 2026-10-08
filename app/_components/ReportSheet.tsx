"use client";
import { useEffect, useState } from "react";
import SendTextButtons, { type TextTarget } from "./SendTextButtons";
import RecentSends from "./RecentSends";

/**
 * The report of every open lead as WhatsApp text (lib/cardText.ts reportText):
 * read it here, send it to the preview group to see it as Dudu will, then send
 * it to Dudu. What is shown is exactly what is sent — the server builds both.
 */
export default function ReportSheet({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [parts, setParts] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/report")
      .then(async (r) => {
        const b = await r.json();
        if (!alive) return;
        if (!r.ok) return setError(b.error ?? `HTTP ${r.status}`);
        setParts(b.parts);
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [version]);

  async function send(to: TextTarget): Promise<string | null> {
    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to }),
    });
    const body = await res.json();
    if (!res.ok) return body.error ?? `HTTP ${res.status}`;
    // What was sent is the board as of now — refresh the preview so it matches.
    setVersion((v) => v + 1);
    onChanged();
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-ink/40" onClick={onClose}>
      <div className="w-full sm:max-w-lg bg-paper rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[92dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">דוח כל הלידים</h3>
          <button data-id="report-close" onClick={onClose} className="size-9 rounded-full hover:bg-white text-xl cursor-pointer transition" aria-label="סגירה">
            ×
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
          {!parts && !error && <p className="text-sm text-muted">טוען…</p>}
          {parts?.map((p, i) => (
            <pre key={i} className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed bg-[#e7f6e9] rounded-2xl rounded-se-sm p-3 border border-line">
              {p}
            </pre>
          ))}
        </div>

        {error ? <p className="text-red-700 text-sm">{error}</p> : parts && <SendTextButtons idPrefix="report" what="הדוח" send={send} />}
        <RecentSends refreshKey={version} onChanged={onChanged} />
      </div>
    </div>
  );
}
