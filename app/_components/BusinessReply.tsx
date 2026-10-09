"use client";
import { useState } from "react";
import type { Lead } from "./types";

/**
 * Answer the customer on the business line, by hand. A price only ever reaches
 * a customer this way — the assistant never names one. WhatsApp takes free
 * text only until 24 hours after the customer's last message.
 */
export default function BusinessReply({ lead, onSent }: { lead: Lead; onSent: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const until = lead.businessChat?.replyUntil ?? null;
  const open = !!lead.businessChat?.canReply;

  async function send() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/leads/${lead.id}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? `HTTP ${res.status}`);
    setText("");
    onSent();
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-bold text-ink-2">תשובה ללקוח בקו העסקי</h3>
        {until && (
          <span className="text-[11px] text-muted">
            {open
              ? `אפשר לענות עד ${new Date(until).toLocaleString("he-IL", { weekday: "short", hour: "2-digit", minute: "2-digit" })}`
              : "עברו 24 שעות מההודעה האחרונה שלו"}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <textarea
          data-id="business-reply-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!open || busy}
          rows={2}
          placeholder={open ? "כתבו ללקוח…" : "וואטסאפ מאפשר עכשיו רק הודעת תבנית מאושרת"}
          className="flex-1 resize-y rounded-xl border border-line px-3 py-2 text-sm focus:outline-none focus:border-harbour-2 disabled:bg-paper disabled:cursor-not-allowed"
        />
        <button
          data-id="business-reply-send"
          disabled={!open || busy || !text.trim()}
          onClick={send}
          className="rounded-xl px-5 bg-harbour text-white font-semibold hover:bg-harbour-2 active:scale-[.98] cursor-pointer transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "שולח…" : "שלח"}
        </button>
      </div>
      {error && <p className="text-red-700 text-sm">{error}</p>}
    </div>
  );
}
