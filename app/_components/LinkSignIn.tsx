"use client";
import { useState } from "react";
import Mark from "./Mark";

/** The one tap that uses a sign-in link (see app/api/session/link/route.ts). */
export default function LinkSignIn({ name, u, exp, sig }: { name: string; u: string; exp: number; sig: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/session/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ u, exp, sig }),
    });
    if (res.ok) return location.replace("/");
    setBusy(false);
    const code = (await res.json().catch(() => ({}))).error;
    setError(code === "used" ? "הקישור הזה כבר שימש לכניסה. בקשו קישור חדש." : "הקישור פג תוקף. בקשו קישור חדש.");
  }

  return (
    <main className="min-h-dvh band grid place-items-center px-4">
      <div className="rise w-full max-w-sm bg-white rounded-3xl p-7 shadow-2xl">
        <Mark className="size-14" />
        <h1 className="text-2xl font-extrabold mt-4">ourLeads</h1>
        <p className="text-muted text-sm mt-1">כניסה ללוח בתור {name}. הקישור עובד פעם אחת, במכשיר הזה.</p>
        {error && <p className="text-red-700 text-sm mt-3">{error}</p>}
        <button
          data-id="link-signin"
          onClick={go}
          disabled={busy}
          className="mt-5 w-full rounded-xl bg-harbour text-white py-3 font-semibold hover:bg-harbour-2 active:scale-[.99] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "נכנס…" : `כניסה בתור ${name}`}
        </button>
      </div>
    </main>
  );
}
