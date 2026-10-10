"use client";
import { useEffect, useState } from "react";
import { when, type Lead } from "./types";
import SendTextButtons, { type TextTarget } from "./SendTextButtons";
import RecentSends from "./RecentSends";
import ClearPreview from "./ClearPreview";

/**
 * Send this lead's card to someone outside the board — a subcontractor, anyone — as a link that opens the one lead with no
 * sign-in. Everything is in it unless ticked off here; the server stores the
 * choice with the link, so the receiver cannot undo it.
 */
const FIELDS = [
  { id: "contact", label: "פרטי הלקוח", hint: "שם וטלפון" },
  { id: "address", label: "כתובת", hint: "העיר נשארת" },
  { id: "price", label: "מחיר", hint: "מחיר ללקוח וקבלן משנה" },
  { id: "photos", label: "תמונות", hint: "וסרטונים" },
  { id: "history", label: "היסטוריה", hint: "ההודעות וההערות" },
] as const;
type Field = (typeof FIELDS)[number]["id"];
const LABEL = Object.fromEntries(FIELDS.map((f) => [f.id, f.label])) as Record<Field, string>;

/** The history is free text that names the phone, the street and the price — hiding any of them hides it. */
const FORCES_HISTORY: Field[] = ["contact", "address", "price"];

interface Share {
  token: string;
  url: string;
  hide: Field[];
  createdBy: string;
  createdAt: string;
  revoked: boolean;
}

export default function ShareCard({ lead, onClose, onChanged }: { lead: Lead; onClose: () => void; onChanged: () => void }) {
  const [hide, setHide] = useState<Set<Field>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shares, setShares] = useState<Share[]>([]);
  const historyForced = FORCES_HISTORY.some((f) => hide.has(f));
  const effective = new Set<Field>(historyForced ? [...hide, "history"] : hide);
  // Without the customer's details, the server leaves out the photos that show his whole number
  // (and any not checked yet); say how many, so a card with fewer photos is not a surprise.
  const images = lead.messages.filter((m) => m.mediaType === "image" && m.mediaUrl);
  const dropped = effective.has("contact") && !effective.has("photos") ? images.filter((m) => m.phoneShown !== "none" && m.phoneShown !== "partial").length : 0;

  const [version, setVersion] = useState(0);
  const [sentVersion, setSentVersion] = useState(0);
  const load = () => setVersion((v) => v + 1);
  useEffect(() => {
    let alive = true;
    fetch(`/api/leads/${lead.id}/shares`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => alive && b && setShares(b.shares));
    return () => {
      alive = false;
    };
  }, [lead.id, version]);

  const toggle = (f: Field) => {
    setMade(null);
    setHide((s) => {
      const n = new Set(s);
      if (n.has(f)) n.delete(f);
      else n.add(f);
      return n;
    });
  };

  async function create() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/leads/${lead.id}/shares`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hide: [...effective] }),
    });
    setBusy(false);
    const body = await res.json();
    if (!res.ok) return setError(body.error ?? `HTTP ${res.status}`);
    setMade(body.url);
    setCopied(false);
    load();
    onChanged();
  }

  /** The card as plain text — for a reader who does not open links. Resolves to an error, or null. */
  async function sendText(to: TextTarget): Promise<string | null> {
    const res = await fetch(`/api/leads/${lead.id}/send-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, hide: [...effective] }),
    });
    const body = await res.json();
    if (!res.ok) return body.error ?? `HTTP ${res.status}`;
    setSentVersion((v) => v + 1);
    onChanged();
    return null;
  }

  async function revoke(token: string) {
    setBusy(true);
    const res = await fetch(`/api/shares/${token}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return setError((await res.json()).error ?? `HTTP ${res.status}`);
    load();
    onChanged();
  }

  const text = made ? `${lead.title}\n${made}` : "";
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-ink/40" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-paper rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">שליחת כרטיס</h3>
          <button data-id="share-close" onClick={onClose} className="size-9 rounded-full hover:bg-white text-xl cursor-pointer transition" aria-label="סגירה">
            ×
          </button>
        </div>
        <p className="text-sm text-muted">קישור שפותח רק את הליד הזה, בלי כניסה. הכרטיס מלא — סמנו מה להוריד.</p>

        <div className="bg-white rounded-2xl border border-line divide-y divide-line">
          {FIELDS.map((f) => {
            const forced = f.id === "history" && historyForced;
            const on = effective.has(f.id);
            return (
              <label key={f.id} className={`flex items-center gap-3 px-4 py-3 text-sm ${forced ? "cursor-not-allowed" : "cursor-pointer hover:bg-paper"} transition`}>
                <input
                  data-id={`share-hide-${f.id}`}
                  type="checkbox"
                  checked={on}
                  disabled={forced}
                  onChange={() => toggle(f.id)}
                  className="size-4 accent-harbour cursor-pointer disabled:cursor-not-allowed"
                />
                <span className="flex-1">
                  בלי {f.label}
                  <span className="text-muted text-xs ms-2">{forced ? "יורדת יחד עם השאר — ההודעות מזכירות אותם" : f.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
        {dropped > 0 && (
          <p className="text-xs text-[#8a4a0b] bg-amber-soft rounded-xl px-3 py-2">
            {dropped === images.length ? "כל התמונות" : `${dropped} מתוך ${images.length} תמונות`} לא ייכנסו לכרטיס — רואים בהן את המספר של הלקוח, או שעוד לא נבדקו.
          </p>
        )}

        {!made ? (
          <button
            data-id="share-create"
            disabled={busy}
            onClick={create}
            className="w-full rounded-2xl py-3 bg-harbour text-white font-semibold hover:bg-harbour-2 cursor-pointer transition disabled:opacity-50 disabled:cursor-wait"
          >
            {effective.size ? `צור קישור — בלי ${[...effective].map((f) => LABEL[f]).join(", ")}` : "צור קישור לכרטיס המלא"}
          </button>
        ) : (
          <div className="space-y-2">
            <div className="rounded-xl bg-white border border-line px-3 py-2 text-sm break-all" dir="ltr">
              {made}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <a
                data-id="share-whatsapp"
                href={`https://wa.me/?text=${encodeURIComponent(text)}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl py-2.5 text-center text-sm font-semibold bg-israel text-white hover:opacity-90 cursor-pointer transition"
              >
                וואטסאפ
              </a>
              <a
                data-id="share-email"
                href={`mailto:?subject=${encodeURIComponent(lead.title)}&body=${encodeURIComponent(text)}`}
                className="rounded-xl py-2.5 text-center text-sm font-semibold bg-white border border-line hover:border-harbour-2 cursor-pointer transition"
              >
                מייל
              </a>
              {canShare ? (
                <button
                  data-id="share-native"
                  onClick={() => navigator.share({ title: lead.title, text: lead.title, url: made }).catch(() => {})}
                  className="rounded-xl py-2.5 text-sm font-semibold bg-white border border-line hover:border-harbour-2 cursor-pointer transition"
                >
                  עוד…
                </button>
              ) : (
                <button
                  data-id="share-copy"
                  onClick={() => navigator.clipboard.writeText(made).then(() => setCopied(true))}
                  className="rounded-xl py-2.5 text-sm font-semibold bg-white border border-line hover:border-harbour-2 cursor-pointer transition"
                >
                  {copied ? "הועתק ✓" : "העתק"}
                </button>
              )}
            </div>
          </div>
        )}
        <div className="pt-1 space-y-2">
          <h4 className="text-[13px] font-bold text-ink-2">או כטקסט בוואטסאפ</h4>
          <SendTextButtons idPrefix="share-text" what="הכרטיס" send={sendText} resetKey={[...effective].sort().join(",")} />
          <RecentSends leadId={lead.id} refreshKey={sentVersion} onChanged={onChanged} />
          <ClearPreview
            onDone={() => {
              setSentVersion((v) => v + 1);
              onChanged();
            }}
          />
        </div>
        {error && <p className="text-red-700 text-sm">{error}</p>}

        {shares.length > 0 && (
          <div className="space-y-2 pt-1">
            <h4 className="text-[13px] font-bold text-ink-2">קישורים שנשלחו</h4>
            {shares.map((s) => (
              <div key={s.token} className={`flex items-center gap-2 text-sm bg-white rounded-xl border border-line px-3 py-2 ${s.revoked ? "opacity-50" : ""}`}>
                <span className="flex-1 min-w-0">
                  {s.hide.length ? `בלי ${s.hide.map((f) => LABEL[f]).join(", ")}` : "כרטיס מלא"}
                  <span className="text-muted text-xs block">
                    {s.createdBy} · {when(s.createdAt)}
                    {s.revoked ? " · בוטל" : ""}
                  </span>
                </span>
                {!s.revoked && (
                  <button
                    data-id="share-revoke"
                    disabled={busy}
                    onClick={() => revoke(s.token)}
                    className="rounded-full px-3 py-1 text-xs text-muted border border-line hover:text-[#b91c1c] hover:border-[#fca5a5] cursor-pointer transition disabled:opacity-50"
                  >
                    בטל
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
