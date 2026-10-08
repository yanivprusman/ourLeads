"use client";
import { useState } from "react";

/**
 * The two places lead text goes (lib/config.ts TEXT_TARGETS): the preview group,
 * to read it first, and Dudu. Sending to Dudu is in Yaniv's name in a real chat,
 * so it takes a second tap — the first one only arms it, and it disarms by itself.
 *
 * `send(to)` does the request and resolves to an error message, or null when sent.
 * `resetKey` changing (e.g. what to hide) clears the "sent ✓" state, since the next
 * send would be a different message.
 */
export type TextTarget = "preview" | "dudu";

const ARM_MS = 4000;

export default function SendTextButtons({
  idPrefix,
  what,
  send,
  resetKey,
}: {
  idPrefix: string;
  /** "הכרטיס" / "הדוח" — for the button labels. */
  what: string;
  send: (to: TextTarget) => Promise<string | null>;
  resetKey?: string;
}) {
  const [busy, setBusy] = useState<TextTarget | null>(null);
  const [sent, setSent] = useState<Partial<Record<TextTarget, string>>>({});
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    setKey(resetKey);
    setSent({});
    setArmed(false);
  }

  async function go(to: TextTarget) {
    if (to === "dudu" && !armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), ARM_MS);
      return;
    }
    setArmed(false);
    setBusy(to);
    setError(null);
    const err = await send(to);
    setBusy(null);
    if (err) return setError(err);
    setSent((s) => ({ ...s, [to]: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) }));
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          data-id={`${idPrefix}-to-preview`}
          disabled={!!busy}
          onClick={() => go("preview")}
          className="rounded-2xl py-3 px-2 text-sm font-semibold bg-white border border-line hover:border-harbour-2 cursor-pointer transition disabled:opacity-50 disabled:cursor-wait"
        >
          {busy === "preview" ? "שולח…" : sent.preview ? `בקבוצה ריקה ✓ ${sent.preview}` : "לקבוצה ריקה (בדיקה)"}
        </button>
        <button
          data-id={`${idPrefix}-to-dudu`}
          disabled={!!busy}
          onClick={() => go("dudu")}
          className={`rounded-2xl py-3 px-2 text-sm font-semibold text-white cursor-pointer transition disabled:opacity-50 disabled:cursor-wait ${
            armed ? "bg-amber hover:opacity-90" : "bg-israel hover:opacity-90"
          }`}
        >
          {busy === "dudu" ? "שולח…" : armed ? "לחצו שוב לשליחה לדודו" : sent.dudu ? `נשלח לדודו ✓ ${sent.dudu}` : `שלח את ${what} לדודו`}
        </button>
      </div>
      <p className="text-xs text-muted">הפרטים עצמם בתוך ההודעה, בלי קישור. לדודו — מהמספר שלך, בצ׳אט שלכם.</p>
      {error && <p className="text-red-700 text-sm">{error}</p>}
    </div>
  );
}
