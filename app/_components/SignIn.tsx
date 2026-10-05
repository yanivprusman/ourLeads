"use client";
import { useState } from "react";

export default function SignIn({ linkExpired }: { linkExpired: boolean }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(linkExpired ? "הקישור פג תוקף. בקשו קישור חדש או הזינו קוד גישה." : null);
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
    <main className="min-h-dvh grid place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border border-line rounded-2xl p-6 shadow-sm">
        <h1 className="text-xl font-bold">outLeads</h1>
        <p className="text-muted text-sm mt-1">לוח הלידים המשותף. הזינו את קוד הגישה שקיבלתם.</p>
        <input
          data-id="signin-code"
          type="password"
          autoComplete="current-password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="mt-4 w-full rounded-lg border border-line px-3 py-2.5 text-base outline-none focus:border-brand"
          placeholder="קוד גישה"
          dir="ltr"
        />
        {error && <p className="text-red-700 text-sm mt-2">{error}</p>}
        <button
          data-id="signin-submit"
          disabled={busy || !code}
          className="mt-4 w-full rounded-lg bg-brand text-white py-2.5 font-medium hover:bg-brand-ink active:scale-[.99] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          כניסה
        </button>
      </form>
    </main>
  );
}
