"use client";
import { useState } from "react";

/**
 * Where lead text goes (lib/config.ts TEXT_TARGETS): the preview group, to read
 * it there and forward it to whoever needs it. Dudu's chat was the second
 * target until he left (2026-10-10).
 *
 * `send(to)` does the request and resolves to an error message, or null when sent.
 * `resetKey` changing (e.g. what to hide) clears the "sent ✓" state, since the next
 * send would be a different message.
 */
export type TextTarget = "preview";

export default function SendTextButtons({
  idPrefix,
  send,
  resetKey,
}: {
  idPrefix: string;
  /** "הכרטיס" / "הדוח" — kept for callers; the one button names the group. */
  what: string;
  send: (to: TextTarget) => Promise<string | null>;
  resetKey?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    setKey(resetKey);
    setSent(null);
  }

  async function go() {
    setBusy(true);
    setError(null);
    const err = await send("preview");
    setBusy(false);
    if (err) return setError(err);
    setSent(new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }));
  }

  return (
    <div className="space-y-2">
      <button
        data-id={`${idPrefix}-to-preview`}
        disabled={busy}
        onClick={go}
        className="w-full rounded-2xl py-3 px-2 text-sm font-semibold bg-white border border-line hover:border-harbour-2 cursor-pointer transition disabled:opacity-50 disabled:cursor-wait"
      >
        {busy ? "שולח…" : sent ? `בקבוצה ריקה ✓ ${sent}` : "לקבוצה ריקה"}
      </button>
      <p className="text-xs text-muted">הפרטים עצמם בתוך ההודעה, בלי קישור — משם מעבירים למי שצריך.</p>
      {error && <p className="text-red-700 text-sm">{error}</p>}
    </div>
  );
}
