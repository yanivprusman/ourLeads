"use client";
import { useState } from "react";

/**
 * Delete for everyone every message this app put in קבוצה ריקה — cards and
 * reports, including ones sent before single deletes existed. Two taps.
 */
export default function ClearPreview({ onDone, compact }: { onDone?: () => void; compact?: boolean }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (!armed) {
      setArmed(true);
      setResult(null);
      setTimeout(() => setArmed(false), 4000);
      return;
    }
    setArmed(false);
    setBusy(true);
    setError(null);
    const res = await fetch("/api/sent/clear-preview", { method: "POST" });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error ?? `HTTP ${res.status}`);
    const { deleted, failed } = body as { deleted: number; failed: string[] };
    setResult(
      deleted === 0 && failed.length === 0
        ? "אין הודעות של האפליקציה בקבוצה"
        : `נמחקו ${deleted} הודעות${failed.length ? ` · ${failed.length} לא נמחקו (וואטסאפ לא מאפשר למחוק הודעות ישנות)` : ""}`,
    );
    onDone?.();
    if (compact) setTimeout(() => setResult(null), 6000);
  }

  // The board's header: a small pill on the dark band; the outcome shows in the pill for a moment.
  if (compact)
    return (
      <button
        data-id="clear-preview-header"
        disabled={busy}
        title={error ?? result ?? "מחק מקבוצה ריקה את כל ההודעות שהאפליקציה שלחה"}
        onClick={go}
        className={`text-sm font-semibold rounded-full px-3 py-1.5 cursor-pointer transition disabled:opacity-60 disabled:cursor-wait ${
          armed ? "bg-[#b91c1c] text-white" : error ? "bg-[#fde8e8] text-[#9b1c1c]" : "bg-white/10 hover:bg-white/20 active:bg-white/30"
        }`}
      >
        {busy ? "מוחק…" : armed ? "לחצו שוב למחיקה" : error ? "המחיקה נכשלה" : result ?? "נקה קבוצה ריקה"}
      </button>
    );

  return (
    <div className="space-y-1">
      <button
        data-id="clear-preview"
        disabled={busy}
        onClick={go}
        className={`w-full rounded-2xl py-2.5 text-sm font-semibold border cursor-pointer transition disabled:opacity-50 disabled:cursor-wait ${
          armed ? "bg-[#b91c1c] border-[#b91c1c] text-white" : "bg-white border-line text-[#b91c1c] hover:border-[#fca5a5]"
        }`}
      >
        {busy ? "מוחק…" : armed ? "לחצו שוב — למחוק הכל מקבוצה ריקה" : "מחק את כל ההודעות של האפליקציה מקבוצה ריקה"}
      </button>
      {result && <p className="text-xs text-muted">{result}</p>}
      {error && <p className="text-red-700 text-sm">{error}</p>}
    </div>
  );
}
