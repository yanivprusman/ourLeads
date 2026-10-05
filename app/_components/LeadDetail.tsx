"use client";
import { useState } from "react";
import { STATUS_STYLE, intlPhone, prettyPhone, when, type BoardData, type Lead, type Msg } from "./types";

function MessageBubble({ m, partner }: { m: Msg; partner: string }) {
  return (
    <div className={`flex ${m.fromMe ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.fromMe ? "bg-emerald-50 border border-emerald-100" : "bg-white border border-line"}`}>
        <div className="text-[11px] text-muted mb-1">
          {m.fromMe ? "אני" : partner} · {when(m.sentAt)}
        </div>
        {m.mediaType === "image" && m.mediaUrl && (
          <a data-id="message-image-open" href={m.mediaUrl} target="_blank" rel="noreferrer" className="block cursor-zoom-in">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.mediaUrl} alt="" loading="lazy" className="rounded-lg max-h-72 w-auto" />
          </a>
        )}
        {m.mediaType === "video" && m.mediaUrl && (
          <video data-id="message-video" src={m.mediaUrl} controls preload="metadata" className="rounded-lg max-h-72 w-full" />
        )}
        {m.mediaType === "audio" && (
          <div className="space-y-1">
            {m.mediaUrl && <audio data-id="message-audio" src={m.mediaUrl} controls preload="none" className="w-64 max-w-full" />}
            {m.transcript && <p className="text-ink/90 leading-relaxed">״{m.transcript}״</p>}
          </div>
        )}
        {m.mediaType && !m.mediaUrl && <p className="text-muted italic">[{m.mediaType} — {m.error ? "לא ירד" : "בהורדה"}]</p>}
        {m.content && <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>}
      </div>
    </div>
  );
}

export default function LeadDetail({
  lead,
  data,
  onClose,
  onChanged,
}: {
  lead: Lead;
  data: BoardData;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const source = data.sources.find((s) => s.id === lead.source);
  const partner = source?.partner.split(" ")[0] ?? "שותף";
  const place = [lead.address, lead.city].filter(Boolean).join(", ");

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) setError((await res.json()).error ?? `HTTP ${res.status}`);
    else {
      setNote("");
      onChanged();
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="w-full max-w-xl h-full overflow-y-auto bg-paper shadow-xl pb-28"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 bg-white border-b border-line px-4 py-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted">#{lead.id} · {source?.label}</div>
            <h2 className="text-lg font-bold leading-snug">{lead.title}</h2>
          </div>
          <button
            data-id="lead-close"
            onClick={onClose}
            className="rounded-full size-9 grid place-items-center hover:bg-paper active:bg-line cursor-pointer text-xl"
            aria-label="סגירה"
          >
            ×
          </button>
        </header>

        <section className="p-4 space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {data.statuses.map((s) => (
              <button
                key={s.id}
                data-id={`lead-status-${s.id}`}
                disabled={busy}
                onClick={() => s.id !== lead.status && patch({ status: s.id, note: note.trim() || undefined })}
                className={`rounded-full px-3 py-1.5 text-sm transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  s.id === lead.status
                    ? `${STATUS_STYLE[s.id]} ring-2 ring-offset-1 ring-current font-semibold`
                    : "bg-white border border-line text-muted hover:border-brand hover:text-ink"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-line p-4 space-y-2 text-sm">
            {lead.customerName && <Row k="לקוח" v={lead.customerName} />}
            {lead.trade && <Row k="עבודה" v={lead.trade} />}
            {place && (
              <Row
                k="מקום"
                v={
                  <a
                    data-id="lead-waze"
                    href={`https://waze.com/ul?q=${encodeURIComponent(place)}&navigate=yes`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand underline-offset-2 hover:underline cursor-pointer"
                  >
                    {place} ↗
                  </a>
                }
              />
            )}
            {lead.visitAt && <Row k="ביקור" v={lead.visitAt} />}
            {lead.nextStep && <Row k="הצעד הבא" v={lead.nextStep} />}
            {lead.details && <p className="pt-2 border-t border-line leading-relaxed">{lead.details}</p>}
          </div>

          {lead.phones.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {lead.phones.map((p) => (
                <div key={p} className="flex rounded-full border border-line bg-white overflow-hidden">
                  <a data-id="lead-call" href={`tel:${p}`} className="px-3 py-2 hover:bg-paper cursor-pointer font-medium" dir="ltr">
                    📞 {prettyPhone(p)}
                  </a>
                  <a
                    data-id="lead-whatsapp"
                    href={`https://wa.me/${intlPhone(p)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 border-s border-line hover:bg-emerald-50 text-emerald-700 cursor-pointer"
                  >
                    וואטסאפ
                  </a>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              data-id="lead-note-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="הערה (נשמרת בהיסטוריה)"
              className="flex-1 rounded-lg border border-line px-3 py-2 bg-white outline-none focus:border-brand"
            />
            <button
              data-id="lead-note-save"
              disabled={busy || !note.trim()}
              onClick={() => patch({ note })}
              className="rounded-lg px-4 bg-ink text-white hover:opacity-90 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              שמירה
            </button>
          </div>
          {error && <p className="text-red-700 text-sm">{error}</p>}

          <h3 className="font-semibold pt-2">מהוואטסאפ</h3>
          <div className="space-y-2">
            {lead.messages.length ? (
              lead.messages.map((m) => <MessageBubble key={m.id} m={m} partner={partner} />)
            ) : (
              <p className="text-muted text-sm">אין הודעות משויכות.</p>
            )}
          </div>

          <h3 className="font-semibold pt-2">היסטוריה</h3>
          <ol className="space-y-2 text-sm">
            {[...lead.events].reverse().map((e, i) => (
              <li key={i} className="bg-white border border-line rounded-lg px-3 py-2">
                <div className="text-[11px] text-muted">
                  {when(e.at)} · {e.who}
                </div>
                {e.to && (
                  <div>
                    {e.from ? `${e.from} ← ` : ""}
                    <b>{e.to}</b>
                  </div>
                )}
                {e.text && <div className="text-ink/90">{e.text}</div>}
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-muted w-20 shrink-0">{k}</span>
      <span className="min-w-0">{v}</span>
    </div>
  );
}
