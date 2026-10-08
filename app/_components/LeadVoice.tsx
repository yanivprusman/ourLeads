"use client";
import { useState } from "react";
import { MicGlyph, type CommandReply } from "./VoiceDock";
import { useVoiceCommand } from "./useVoiceCommand";

/**
 * Talk about the open lead, like the mic on the phone's lead screen: hold and
 * say what happened. The sentence goes with this lead's id, so the server
 * changes only this lead and never makes a new one. What it understood is
 * shown right here.
 */
export default function LeadVoice({ leadId, onChanged }: { leadId: number; onChanged: () => void }) {
  const [reply, setReply] = useState<CommandReply | null>(null);
  const { state, error, elapsed, start, stop } = useVoiceCommand((r) => {
    setReply(r);
    onChanged();
  }, leadId);
  const secs = Math.floor(elapsed / 1000);

  return (
    <div className="bg-white rounded-2xl border border-line p-3 space-y-2">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          {state === "recording" && (
            <>
              <span className="ring absolute inset-0 rounded-full bg-red-500" />
              <span className="ring delay absolute inset-0 rounded-full bg-red-500" />
            </>
          )}
          <button
            type="button"
            data-id="lead-voice-hold-to-talk"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setReply(null);
              void start();
            }}
            onPointerUp={stop}
            onPointerCancel={stop}
            onContextMenu={(e) => e.preventDefault()}
            disabled={state === "working"}
            className={`relative size-12 rounded-full grid place-items-center text-white shadow-md transition select-none touch-none cursor-pointer disabled:cursor-wait ${
              state === "recording" ? "bg-red-600 scale-110" : "bg-[radial-gradient(120%_120%_at_30%_20%,#2a8bc0,#14466b)] hover:brightness-110 active:scale-95"
            }`}
            aria-label="החזיקו ודברו על הליד הזה"
          >
            {state === "working" ? (
              <span className="size-5 rounded-full border-[3px] border-white border-t-transparent animate-spin" />
            ) : (
              <MicGlyph className="size-6" />
            )}
          </button>
        </div>
        <div className="flex-1 min-w-0">
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
              <p className="font-semibold leading-tight">ספרו מה קרה עם הליד הזה</p>
              <p className="text-xs text-muted truncate">החזיקו ודברו: ״הלקוח אישר, מתחילים ביום ראשון״</p>
            </>
          )}
        </div>
      </div>
      {error && <p className="bg-[#fde8e8] text-[#9b1c1c] text-sm rounded-xl px-3 py-2">{error}</p>}
      {reply && (
        <div className="bg-paper rounded-xl px-3 py-2 text-sm">
          <p className="text-muted">״{reply.said}״</p>
          <p className="font-semibold mt-0.5">{reply.reply}</p>
        </div>
      )}
    </div>
  );
}
