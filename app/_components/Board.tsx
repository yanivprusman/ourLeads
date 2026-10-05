"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import LeadDetail from "./LeadDetail";
import VoiceBar, { type CommandReply } from "./VoiceBar";
import { STATUS_STYLE, prettyPhone, when, type BoardData } from "./types";

type View = "open" | "all" | string;

const CLOSED = ["done", "lost"];

export default function Board() {
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("open");
  const [source, setSource] = useState<string>("all");
  const [openId, setOpenId] = useState<number | null>(null);
  const [reply, setReply] = useState<CommandReply | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/leads", { cache: "no-store" });
      if (res.status === 401) {
        location.replace("/");
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  const leads = useMemo(() => {
    if (!data) return [];
    return data.leads.filter(
      (l) =>
        (source === "all" || l.source === source) &&
        (view === "all" || (view === "open" ? !CLOSED.includes(l.status) : l.status === view)),
    );
  }, [data, view, source]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of data?.leads ?? []) if (source === "all" || l.source === source) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [data, source]);

  if (!data)
    return (
      <main className="min-h-dvh grid place-items-center text-muted">
        {error ? <p className="text-red-700 px-4 text-center">{error}</p> : "טוען…"}
      </main>
    );

  const open = data.leads.find((l) => l.id === openId) ?? null;
  const openCount = data.leads.filter((l) => (source === "all" || l.source === source) && !CLOSED.includes(l.status)).length;
  const tabs: { id: View; label: string; n: number }[] = [
    { id: "open", label: "פתוחים", n: openCount },
    ...data.statuses.map((s) => ({ id: s.id, label: s.label, n: counts[s.id] ?? 0 })).filter((t) => t.n > 0),
    { id: "all", label: "הכל", n: Object.values(counts).reduce((a, b) => a + b, 0) },
  ];

  return (
    <main className="min-h-dvh pb-32">
      <header className="bg-white border-b border-line sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 pt-3 pb-2">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight">outLeads</h1>
            <span className="text-sm text-muted">שלום {data.me.name}</span>
            {data.pending > 0 && (
              <span className="ms-auto text-xs text-muted flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                {data.pending} הודעות חדשות בעיבוד
              </span>
            )}
          </div>
          <div className="flex gap-1.5 mt-2.5 overflow-x-auto no-scrollbar">
            {[{ id: "all", label: "כל השותפים" }, ...data.sources].map((s) => (
              <button
                key={s.id}
                data-id={`filter-source-${s.id}`}
                onClick={() => setSource(s.id)}
                className={`shrink-0 rounded-full px-3 py-1 text-sm border transition cursor-pointer ${
                  source === s.id ? "bg-ink text-white border-ink" : "bg-white border-line text-muted hover:text-ink hover:border-ink/40"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <nav className="flex gap-4 mt-2 overflow-x-auto no-scrollbar -mb-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                data-id={`tab-${t.id}`}
                {...(view === t.id ? { "data-active-tab": t.label } : {})}
                onClick={() => setView(t.id)}
                className={`shrink-0 pb-2 border-b-2 text-sm transition cursor-pointer ${
                  view === t.id ? "border-brand text-ink font-semibold" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {t.label} <span className="text-xs opacity-70">{t.n}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 pt-4 space-y-3">
        {error && <p className="text-red-700 text-sm">{error}</p>}

        {reply && (
          <div className="rounded-xl border border-brand/30 bg-sky-50 p-3 text-sm">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <p className="text-muted">״{reply.said}״</p>
                <p className="font-medium mt-1">{reply.reply}</p>
                {reply.changes.map((c) => (
                  <button
                    key={c.leadId}
                    data-id="reply-open-lead"
                    onClick={() => setOpenId(c.leadId)}
                    className="block text-brand hover:underline cursor-pointer mt-0.5 text-start"
                  >
                    #{c.leadId} {c.title}
                    {c.to ? ` → ${c.to}` : ""}
                  </button>
                ))}
              </div>
              <button data-id="reply-dismiss" onClick={() => setReply(null)} className="text-muted hover:text-ink cursor-pointer px-1">
                ×
              </button>
            </div>
          </div>
        )}

        {leads.length === 0 && <p className="text-muted text-center py-12">אין כאן לידים.</p>}

        {leads.map((l) => {
          const src = data.sources.find((s) => s.id === l.source);
          const thumb = l.messages.find((m) => m.mediaType === "image" && m.mediaUrl)?.mediaUrl;
          return (
            <button
              key={l.id}
              data-id="lead-card"
              onClick={() => setOpenId(l.id)}
              className="w-full text-start bg-white rounded-xl border border-line p-3.5 flex gap-3 hover:border-brand/50 hover:shadow-sm active:scale-[.995] transition cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLE[l.status]}`}>{l.statusLabel}</span>
                  <span className="text-muted">{src?.label}</span>
                  <span className="text-muted ms-auto">{when(l.lastMessageAt ?? l.createdAt)}</span>
                </div>
                <h2 className="font-semibold mt-1.5 leading-snug">{l.title}</h2>
                <p className="text-sm text-muted mt-0.5 truncate">
                  {[l.customerName, l.phones[0] && prettyPhone(l.phones[0]), l.visitAt && `ביקור: ${l.visitAt}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {l.nextStep && <p className="text-sm mt-1 line-clamp-1">← {l.nextStep}</p>}
              </div>
              {thumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" loading="lazy" className="size-16 rounded-lg object-cover shrink-0" />
              )}
            </button>
          );
        })}

        {data.unassigned.length > 0 && (view === "open" || view === "all") && (
          <Unassigned data={data} onChanged={load} />
        )}
      </div>

      {open && <LeadDetail lead={open} data={data} onClose={() => setOpenId(null)} onChanged={load} />}

      <VoiceBar
        onDone={(r) => {
          setReply(r);
          void load();
        }}
      />
    </main>
  );
}

function Unassigned({ data, onChanged }: { data: BoardData; onChanged: () => void }) {
  const [show, setShow] = useState(false);
  const openLeads = data.leads.filter((l) => !CLOSED.includes(l.status));
  async function assign(id: string, chatJid: string, leadId: number) {
    const res = await fetch("/api/messages/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, chatJid, leadId }),
    });
    if (res.ok) onChanged();
  }
  return (
    <section className="pt-4">
      <button
        data-id="unassigned-toggle"
        onClick={() => setShow(!show)}
        className="text-sm text-muted hover:text-ink cursor-pointer"
      >
        {show ? "▾" : "▸"} הודעות שלא שויכו לליד ({data.unassigned.length})
      </button>
      {show && (
        <ul className="mt-2 space-y-2">
          {data.unassigned.map((m) => (
            <li key={m.id} className="bg-white border border-line rounded-lg p-3 text-sm">
              <div className="text-[11px] text-muted">
                {data.sources.find((s) => s.id === m.source)?.label} · {when(m.sentAt)}
              </div>
              <p className="whitespace-pre-wrap">
                {m.mediaType ? `[${m.mediaType}] ` : ""}
                {m.transcript ?? m.content}
              </p>
              <select
                data-id="unassigned-assign"
                defaultValue=""
                onChange={(e) => e.target.value && assign(m.id, m.chatJid, Number(e.target.value))}
                className="mt-2 rounded border border-line px-2 py-1 bg-white cursor-pointer"
              >
                <option value="">שיוך לליד…</option>
                {openLeads.map((l) => (
                  <option key={l.id} value={l.id}>
                    #{l.id} {l.title}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
