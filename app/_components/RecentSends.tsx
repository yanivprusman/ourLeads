"use client";
import { useEffect, useState } from "react";
import { when } from "./types";

/**
 * Sends made from here that WhatsApp still lets us delete for everyone (about
 * two days) — the reports, or one lead's cards when `leadId` is given. Delete
 * takes a second tap: the first arms it, and it disarms by itself.
 * `refreshKey` changing reloads the list (after a new send).
 */
interface Send {
  batch: string;
  kind: "card" | "report";
  to: string;
  messages: number;
  sentBy: string;
  sentAt: string;
}

const ARM_MS = 4000;

export default function RecentSends({ leadId, refreshKey, onChanged }: { leadId?: number; refreshKey: number; onChanged?: () => void }) {
  const [sends, setSends] = useState<Send[]>([]);
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch(`/api/sent${leadId === undefined ? "" : `?leadId=${leadId}`}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => alive && b && setSends(b.sends));
    return () => {
      alive = false;
    };
  }, [leadId, refreshKey, version]);

  async function remove(batch: string) {
    if (armed !== batch) {
      setArmed(batch);
      setTimeout(() => setArmed((a) => (a === batch ? null : a)), ARM_MS);
      return;
    }
    setArmed(null);
    setBusy(batch);
    setError(null);
    const res = await fetch(`/api/sent/${batch}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) return setError((await res.json()).error ?? `HTTP ${res.status}`);
    setVersion((v) => v + 1);
    onChanged?.();
  }

  if (!sends.length && !error) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-[13px] font-bold text-ink-2">נשלחו לאחרונה</h4>
      {sends.map((s) => (
        <div key={s.batch} className="flex items-center gap-2 text-sm bg-white rounded-xl border border-line px-3 py-2">
          <span className="flex-1 min-w-0">
            {s.kind === "report" ? "דוח" : "כרטיס"} ל{s.to}
            {s.messages > 1 ? ` · ${s.messages} הודעות` : ""}
            <span className="text-muted text-xs block">
              {s.sentBy} · {when(s.sentAt)}
            </span>
          </span>
          <button
            data-id="sent-delete"
            disabled={!!busy}
            onClick={() => remove(s.batch)}
            className={`rounded-full px-3 py-1 text-xs border cursor-pointer transition disabled:opacity-50 disabled:cursor-wait ${
              armed === s.batch ? "bg-[#b91c1c] text-white border-[#b91c1c]" : "text-muted border-line hover:text-[#b91c1c] hover:border-[#fca5a5]"
            }`}
          >
            {busy === s.batch ? "מוחק…" : armed === s.batch ? "לחצו שוב למחיקה" : "מחק מהוואטסאפ"}
          </button>
        </div>
      ))}
      {error && <p className="text-red-700 text-sm">{error}</p>}
    </div>
  );
}
