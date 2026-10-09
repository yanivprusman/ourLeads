"use client";
import { useState } from "react";
import type { BoardData } from "./types";

/**
 * Busy mode for the business line. On: the assistant answers customers for us,
 * as our assistant, while we are on a job. Off: it stays quiet and we answer.
 * It stays where it is set — there is no timer (Yaniv, 2026-10-09).
 */
export default function BusyToggle({ assistant, onChanged }: { assistant: BoardData["assistant"]; onChanged: () => void }) {
  const [busy, setBusy] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const on = busy ?? assistant.busy;

  async function flip() {
    const next = !on;
    setBusy(next);
    setError(null);
    const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ busy: next }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(null);
      setError(body.error ?? `HTTP ${res.status}`);
      return;
    }
    onChanged();
    setBusy(null);
  }

  const title = error
    ? `השינוי נכשל: ${error}`
    : !assistant.configured
      ? "הקו העסקי עוד לא מחובר — המתג נשמר, והעוזר יתחיל לענות כשיתחבר"
      : on
        ? "העוזר עונה ללקוחות בקו העסקי. לחצו כשאתם פנויים לענות בעצמכם"
        : "אתם עונים ללקוחות בעצמכם. לחצו כשאתם באמצע עבודה, והעוזר יענה";

  return (
    <button
      data-id="assistant-busy-toggle"
      role="switch"
      aria-checked={on}
      title={title}
      onClick={flip}
      className={`inline-flex items-center gap-2 text-sm font-semibold rounded-full ps-1.5 pe-3 py-1 cursor-pointer transition ${
        error ? "bg-[#fde8e8] text-[#9b1c1c]" : on ? "bg-amber text-ink hover:brightness-105 active:brightness-95" : "bg-white/10 hover:bg-white/20 active:bg-white/30"
      }`}
    >
      <span className={`relative h-5 w-9 rounded-full transition ${on ? "bg-ink/25" : "bg-white/25"}`}>
        <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${on ? "start-[18px]" : "start-0.5"}`} />
      </span>
      {on ? "עסוק · העוזר עונה" : "זמין"}
    </button>
  );
}
