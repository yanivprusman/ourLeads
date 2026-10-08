"use client";
import { useState } from "react";
import { useVoiceCommand } from "./useVoiceCommand";

interface Change {
  leadId: number;
  title: string;
  from: string | null;
  to: string | null;
  note: string | null;
  created?: boolean;
}
export interface CommandReply {
  said: string;
  reply: string;
  changes: Change[];
}

/**
 * The way to tell the board something: hold the big button and talk, or switch to the
 * keyboard. What comes back is said back above the dock — what it heard, and exactly
 * which lead changed to what — so a misheard name is caught on the spot.
 */
export default function VoiceDock({
  reply,
  onReply,
  onOpenLead,
  onDismiss,
}: {
  reply: CommandReply | null;
  onReply: (r: CommandReply) => void;
  onOpenLead: (id: number) => void;
  onDismiss: () => void;
}) {
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const { state, error, elapsed, start, stop, send } = useVoiceCommand(onReply);

  async function sendText() {
    if (await send({ text })) {
      setText("");
      setTyping(false);
    }
  }

  const secs = Math.floor(elapsed / 1000);

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 pointer-events-none">
      <div className="max-w-3xl mx-auto px-4 pb-4 space-y-2">
        {reply && (
          <div className="rise pointer-events-auto bg-ink text-white rounded-2xl p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-white/55 text-sm">״{reply.said}״</p>
                <p className="font-semibold mt-1 leading-snug">{reply.reply}</p>
                {reply.changes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {reply.changes.map((c) => (
                      <button
                        key={c.leadId}
                        data-id="reply-open-lead"
                        onClick={() => onOpenLead(c.leadId)}
                        className="rounded-full bg-white/10 hover:bg-white/20 px-3 py-1 text-sm cursor-pointer transition"
                      >
                        {c.title}
                        {c.to && <b className="text-amber"> ← {c.to}</b>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                data-id="reply-dismiss"
                onClick={onDismiss}
                className="text-white/50 hover:text-white cursor-pointer text-xl leading-none px-1"
                aria-label="סגירה"
              >
                ×
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="pointer-events-auto rise bg-[#fde8e8] text-[#9b1c1c] text-sm rounded-xl px-3 py-2">{error}</p>
        )}

        <div className="pointer-events-auto bg-white/95 backdrop-blur rounded-[28px] shadow-[0_10px_40px_-10px_rgba(13,42,67,.35)] border border-line p-2 pe-16 flex items-center gap-2">
          {!typing && (
            <div className="relative shrink-0">
              {state === "recording" && (
                <>
                  <span className="ring absolute inset-0 rounded-full bg-red-500" />
                  <span className="ring delay absolute inset-0 rounded-full bg-red-500" />
                </>
              )}
              <button
                type="button"
                data-id="voice-hold-to-talk"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  void start().then((ok) => ok || setTyping(true));
                }}
                onPointerUp={stop}
                onPointerCancel={stop}
                onContextMenu={(e) => e.preventDefault()}
                disabled={state === "working"}
                className={`relative size-16 rounded-full grid place-items-center text-white shadow-lg transition select-none touch-none cursor-pointer disabled:cursor-wait ${
                  state === "recording"
                    ? "bg-red-600 scale-110"
                    : "bg-[radial-gradient(120%_120%_at_30%_20%,#2a8bc0,#14466b)] hover:brightness-110 active:scale-95"
                }`}
                aria-label="החזיקו ודברו"
              >
                {state === "working" ? (
                  <span className="size-6 rounded-full border-[3px] border-white border-t-transparent animate-spin" />
                ) : (
                  <MicGlyph className="size-7" />
                )}
              </button>
            </div>
          )}
          {typing ? (
            <form
              className="flex-1 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) void sendText();
              }}
            >
              <input
                data-id="voice-text-input"
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="״קבעתי עם אורן לחמישי בעשר״"
                className="flex-1 min-w-0 bg-transparent px-3 py-3 text-base outline-none"
                disabled={state !== "idle"}
              />
              <button
                data-id="voice-send-text"
                disabled={!text.trim() || state !== "idle"}
                className="rounded-full px-5 py-3 bg-harbour text-white font-semibold hover:bg-harbour-2 cursor-pointer transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {state === "working" ? "…" : "עדכן"}
              </button>
            </form>
          ) : (
            <div className="flex-1 px-3 min-w-0">
              {state === "recording" ? (
                <p className="font-semibold text-ink flex items-center gap-2">
                  <span className="size-2 rounded-full bg-red-600 animate-pulse" />
                  מקליט <span className="tabular-nums text-muted">0:{String(secs).padStart(2, "0")}</span>
                  <span className="text-muted font-normal text-sm">— שחררו לשליחה</span>
                </p>
              ) : state === "working" ? (
                <p className="text-ink-2">מבין ומעדכן…</p>
              ) : (
                <>
                  <p className="font-semibold leading-tight">ספרו לי מה קרה</p>
                  <p className="text-xs text-muted truncate">החזיקו ודברו: ״דיברתי עם שי, שולח הצעה מחר״</p>
                </>
              )}
            </div>
          )}

          <button
            type="button"
            data-id="voice-toggle-keyboard"
            onClick={() => setTyping(!typing)}
            disabled={state !== "idle"}
            className="size-11 rounded-full grid place-items-center text-muted hover:bg-paper hover:text-ink cursor-pointer transition disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={typing ? "דיבור" : "הקלדה"}
          >
            {typing ? <MicGlyph className="size-5" /> : <KeyboardGlyph />}
          </button>

        </div>
      </div>
    </div>
  );
}

export function MicGlyph({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" />
    </svg>
  );
}

function KeyboardGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7 14h10" strokeLinecap="round" />
    </svg>
  );
}
