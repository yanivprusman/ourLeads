"use client";
import { useState } from "react";
import Mark from "./Mark";

export default function SignIn({ linkExpired = false, linkUsed = false }: { linkExpired?: boolean; linkUsed?: boolean }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(
    linkUsed ? "הקישור הזה כבר שימש לכניסה — כל קישור עובד פעם אחת. בקשו קישור חדש או הזינו קוד גישה."
    : linkExpired ? "הקישור פג תוקף. בקשו קישור חדש או הזינו קוד גישה." : null,
  );
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    setBusy(false);
    if (res.ok) location.replace("/");
    else setError(res.status === 401 ? "קוד שגוי" : "השרת לא מוגדר — " + ((await res.json()).error ?? ""));
  }

  return (
    <main className="min-h-dvh band grid place-items-center px-4">
      <form onSubmit={submit} className="rise w-full max-w-sm bg-white rounded-3xl p-7 shadow-2xl">
        <Mark className="size-14" />
        <h1 className="text-2xl font-extrabold mt-4">ourLeads</h1>
        <p className="text-muted text-sm mt-1">הלידים של השותפות במקום אחד — מהוואטסאפ ישר ללוח.</p>
        <input
          data-id="signin-code"
          type="password"
          autoComplete="current-password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="mt-4 w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-harbour-2"
          placeholder="קוד גישה"
          dir="ltr"
        />
        {error && <p className="text-red-700 text-sm mt-2">{error}</p>}
        <button
          data-id="signin-submit"
          disabled={busy || !code}
          className="mt-4 w-full rounded-xl bg-harbour text-white py-3 font-semibold hover:bg-harbour-2 active:scale-[.99] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          כניסה
        </button>
      </form>
    </main>
  );
}
