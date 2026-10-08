"use client";
import { useEffect, useRef, useState } from "react";
import type { CommandReply } from "./VoiceDock";

export type VoiceState = "idle" | "recording" | "working";

/**
 * Hold-to-talk to `/api/command`: `start` on press, `stop` on release, and the
 * recording goes to the server to be transcribed and applied. With `leadId` the
 * sentence is about that one lead (said on its card) — the server changes only
 * it and creates nothing. Shared by the board's dock and the lead panel.
 */
export function useVoiceCommand(onReply: (r: CommandReply) => void, leadId?: number) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);

  useEffect(() => {
    if (state !== "recording") return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt.current), 200);
    return () => clearInterval(t);
  }, [state]);

  /** Post a recording (FormData) or typed text; resolves true when applied. */
  async function send(body: FormData | { text: string }): Promise<boolean> {
    setState("working");
    setError(null);
    try {
      let init: RequestInit;
      if (body instanceof FormData) {
        if (leadId !== undefined) body.append("leadId", String(leadId));
        init = { method: "POST", body };
      } else {
        init = { method: "POST", body: JSON.stringify({ ...body, leadId }), headers: { "Content-Type": "application/json" } };
      }
      const res = await fetch("/api/command", init);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      onReply(json as CommandReply);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setState("idle");
    }
  }

  /** Returns false when the browser offers no microphone here (the caller may switch to typing). */
  async function start(): Promise<boolean> {
    if (state !== "idle") return true;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("הדפדפן לא מאפשר מיקרופון בכתובת הזו — אפשר להקליד");
      return false;
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
          setError("החזיקו את הכפתור לאורך כל המשפט");
          return;
        }
        const form = new FormData();
        form.append("audio", new Blob(chunks.current, { type: r.mimeType || "audio/webm" }), "command.webm");
        void send(form);
      };
      rec.current = r;
      startedAt.current = Date.now();
      setElapsed(0);
      r.start();
      setState("recording");
    } catch (e) {
      setError(`אין גישה למיקרופון: ${(e as Error).message}`);
    }
    return true;
  }

  function stop() {
    if (rec.current?.state === "recording") rec.current.stop();
  }

  return { state, error, setError, elapsed, start, stop, send };
}
