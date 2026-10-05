"use client";
import { useRef, useState } from "react";

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
 * Hold to talk, release to send. The recording is transcribed on the server
 * and matched to a lead there; what comes back is said back on screen so a
 * misheard name is caught immediately.
 */
export default function VoiceBar({ onDone }: { onDone: (r: CommandReply) => void }) {
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);

  async function send(body: BodyInit, headers?: HeadersInit) {
    setState("working");
    setError(null);
    try {
      const res = await fetch("/api/command", { method: "POST", body, headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      onDone(json as CommandReply);
      setText("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setState("idle");
    }
  }

  async function start() {
    if (state !== "idle") return;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("הדפדפן לא מאפשר הקלטה בכתובת הזו (צריך https). אפשר להקליד.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (Date.now() - startedAt.current < 600) {
          setState("idle");
          setError("החזיקו את הכפתור בזמן הדיבור");
          return;
        }
        const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
        const form = new FormData();
        form.append("audio", blob, "command.webm");
        void send(form);
      };
      rec.current = r;
      startedAt.current = Date.now();
      r.start();
      setState("recording");
    } catch (e) {
      setError(`אין גישה למיקרופון: ${(e as Error).message}`);
    }
  }

  function stop() {
    if (rec.current && rec.current.state === "recording") rec.current.stop();
  }

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-line">
      <div className="max-w-3xl mx-auto px-4 py-3">
        {error && <p className="text-red-700 text-sm mb-2">{error}</p>}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) void send(JSON.stringify({ text }), { "Content-Type": "application/json" });
          }}
        >
          <button
            type="button"
            data-id="voice-hold-to-talk"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              void start();
            }}
            onPointerUp={stop}
            onPointerCancel={stop}
            disabled={state === "working"}
            className={`shrink-0 size-14 rounded-full grid place-items-center text-white shadow transition cursor-pointer select-none touch-none disabled:opacity-50 disabled:cursor-not-allowed ${
              state === "recording" ? "bg-red-600 scale-110" : "bg-brand hover:bg-brand-ink"
            }`}
            aria-label="החזיקו ודברו"
          >
            {state === "working" ? (
              <span className="size-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden>
                <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" />
              </svg>
            )}
          </button>
          <input
            data-id="voice-text-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={state === "recording" ? "מקליט… שחררו לשליחה" : "החזיקו ודברו, או כתבו: ״קבעתי עם אורן לחמישי״"}
            className="flex-1 min-w-0 rounded-full border border-line px-4 py-3 text-base outline-none focus:border-brand"
            disabled={state !== "idle"}
          />
          <button
            data-id="voice-send-text"
            disabled={!text.trim() || state !== "idle"}
            className="shrink-0 rounded-full px-4 py-3 bg-ink text-white font-medium hover:opacity-90 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            שלח
          </button>
        </form>
      </div>
    </div>
  );
}
