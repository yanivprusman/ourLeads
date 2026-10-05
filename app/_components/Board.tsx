"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import LeadDetail from "./LeadDetail";
import VoiceDock, { type CommandReply } from "./VoiceDock";
import Mark from "./Mark";
import Calendar, { sayDay } from "./Calendar";
import {
  CLOSED,
  PARTNER_TONE,
  STATES,
  STATUS_TONE,
  intlPhone,
  margin,
  shekel,
  prettyPhone,
  when,
  type BoardData,
  type Lead,
} from "./types";

type View = "open" | string;

export default function Board() {
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("open");
  const [mode, setMode] = useState<"leads" | "calendar">("leads");
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

  const inSource = useMemo(
    () => (data?.leads ?? []).filter((l) => source === "all" || l.source === source),
    [data, source],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of inSource) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [inSource]);

  if (!data)
    return (
      <main className="min-h-dvh grid place-items-center text-muted">
        {error ? <p className="text-red-700 px-4 text-center">{error}</p> : <Mark className="size-14 animate-pulse" />}
      </main>
    );

  const leads = inSource.filter((l) => (view === "open" ? !CLOSED.includes(l.status) : l.status === view));
  // Nothing done yet goes first, longest-waiting on top.
  const fresh = view === "open" ? leads.filter((l) => l.status === "none").sort((a, b) => (a.lastMessageAt ?? a.createdAt).localeCompare(b.lastMessageAt ?? b.createdAt)) : [];
  const rest = view === "open" ? leads.filter((l) => l.status !== "none") : leads;
  const open = data.leads.find((l) => l.id === openId) ?? null;
  const label = (id: string) => data.statuses.find((s) => s.id === id)?.label ?? id;
  const openCount = inSource.filter((l) => !CLOSED.includes(l.status)).length;

  return (
    <main className="min-h-dvh pb-36">
      <header className="band text-white">
        <div className="max-w-3xl mx-auto px-4 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <Mark className="size-9 drop-shadow" />
            <div className="leading-tight">
              <h1 className="text-xl font-extrabold tracking-tight">ourLeads</h1>
              <p className="text-[13px] text-white/70">
                {openCount} פתוחים · שלום {data.me.name}
              </p>
            </div>
            {data.pending > 0 && (
              <span className="ms-auto text-xs bg-white/10 rounded-full px-2.5 py-1 flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-amber animate-pulse" />
                {data.pending} הודעות בקריאה
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full bg-white/10 p-1 text-sm">
            {(
              [
                ["leads", "לידים"],
                ["calendar", "יומן"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                data-id={`mode-${id}`}
                {...(mode === id ? { "data-active-tab": label } : {})}
                onClick={() => setMode(id)}
                className={`rounded-full px-4 py-1.5 transition cursor-pointer flex items-center gap-1.5 ${
                  mode === id ? "bg-amber text-white font-bold shadow" : "text-white/80 hover:text-white"
                }`}
              >
                {id === "calendar" && <CalGlyph />}
                {label}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-full bg-white/10 p-1 text-sm">
            {[{ id: "all", label: "כולם" }, ...data.sources].map((s) => (
              <button
                key={s.id}
                data-id={`filter-source-${s.id}`}
                onClick={() => setSource(s.id)}
                className={`rounded-full px-3.5 py-1.5 transition cursor-pointer ${
                  source === s.id ? "bg-white text-ink font-semibold shadow" : "text-white/80 hover:text-white"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          </div>
        </div>

        {/* Where the leads stand, with how many are in each. */}
        <nav className={`max-w-3xl mx-auto px-4 pb-4 overflow-x-auto no-scrollbar ${mode === "calendar" ? "hidden" : ""}`}>
          <div className="flex items-stretch gap-1 min-w-max">
            <Stage
              id="open"
              label="הכל"
              n={openCount}
              active={view === "open"}
              onClick={() => setView("open")}
              wide
            />
            <span className="w-px bg-white/15 mx-1" />
            {STATES.map((s) => (
              <Stage key={s} id={s} label={label(s)} n={counts[s] ?? 0} active={view === s} onClick={() => setView(s)} dot={STATUS_TONE[s].dot} />
            ))}
            <span className="w-px bg-white/15 mx-1" />
            <Stage id="removed" label="הוסרו" n={counts.removed ?? 0} active={view === "removed"} onClick={() => setView("removed")} dot={STATUS_TONE.removed.dot} />
          </div>
        </nav>
      </header>

      <div className="max-w-3xl mx-auto px-4 pt-4 space-y-3">
        {error && <p className="text-red-700 text-sm">{error}</p>}

        {mode === "calendar" ? (
          <Calendar data={{ ...data, leads: inSource }} onOpen={(id) => setOpenId(id)} />
        ) : (
          <>
        {fresh.length > 0 && (
          <>
            {fresh.map((l) => (
              <LeadCard key={l.id} lead={l} data={data} onOpen={() => setOpenId(l.id)} />
            ))}
          </>
        )}
        {rest.map((l) => (
          <LeadCard key={l.id} lead={l} data={data} onOpen={() => setOpenId(l.id)} />
        ))}
        {leads.length === 0 && (
          <div className="text-center py-16 text-muted">
            <Mark className="size-12 mx-auto opacity-30" />
            <p className="mt-3">אין כאן לידים.</p>
          </div>
        )}

        {data.unassigned.length > 0 && view === "open" && <Unassigned data={data} onChanged={load} />}
          </>
        )}
      </div>

      {open && <LeadDetail lead={open} data={data} onClose={() => setOpenId(null)} onChanged={load} />}

      <VoiceDock
        reply={reply}
        onReply={(r) => {
          setReply(r);
          void load();
        }}
        onOpenLead={(id) => setOpenId(id)}
        onDismiss={() => setReply(null)}
      />
    </main>
  );
}

function Stage({
  id,
  label,
  n,
  active,
  onClick,
  dot,
  wide,
}: {
  id: string;
  label: string;
  n: number;
  active: boolean;
  onClick: () => void;
  dot?: string;
  wide?: boolean;
}) {
  return (
    <button
      data-id={`stage-${id}`}
      {...(active ? { "data-active-tab": label } : {})}
      onClick={onClick}
      className={`rounded-xl px-3 py-2 text-start transition cursor-pointer ${wide ? "min-w-20" : "min-w-[4.5rem]"} ${
        active ? "bg-white text-ink shadow-lg" : n ? "bg-white/8 text-white hover:bg-white/15" : "bg-white/5 text-white/45 hover:bg-white/10"
      }`}
    >
      <div className="text-xl font-bold tabular-nums leading-none">{n}</div>
      <div className="text-[11.5px] mt-1 flex items-center gap-1 whitespace-nowrap">
        {dot && <span className={`size-1.5 rounded-full ${dot}`} />}
        {label}
      </div>
    </button>
  );
}

function PartnerBadge({ source, data }: { source: string; data: BoardData }) {
  const tone = PARTNER_TONE[source];
  const label = data.sources.find((s) => s.id === source)?.label;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className={`size-5 rounded-full grid place-items-center text-[11px] font-bold ${tone?.chip ?? "bg-muted text-white"}`}>
        {tone?.initial ?? "?"}
      </span>
      {label}
    </span>
  );
}

function LeadCard({ lead: l, data, onOpen }: { lead: Lead; data: BoardData; onOpen: () => void }) {
  const tone = STATUS_TONE[l.status];
  const thumb = l.messages.find((m) => m.mediaType === "image" && m.mediaUrl)?.mediaUrl;
  const phone = l.phones[0];
  const faded = l.status === "removed";
  return (
    <article
      className={`rise relative bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(13,42,67,.04)] overflow-hidden transition hover:shadow-md hover:border-harbour-2/30 ${faded ? "opacity-70" : ""}`}
    >
      <span className={`absolute inset-y-0 start-0 w-1 ${tone.rail}`} />
      <button data-id="lead-card" onClick={onOpen} className="w-full text-start p-4 ps-5 flex gap-3 cursor-pointer">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <PartnerBadge source={l.source} data={data} />
            {l.status !== "none" ? (
              <span className={`ms-auto rounded-full px-2 py-0.5 text-[11.5px] font-bold ${tone.pill}`}>
                {l.statusLabel}
                {l.status === "work" && l.workStart ? ` ${sayDay(l.workStart)}${l.workEnd && l.workEnd !== l.workStart ? ` – ${sayDay(l.workEnd)}` : ""}` : ""}
                {l.status === "meeting" && l.meetingAt ? ` ${sayDay(l.meetingAt.slice(0, 10))} ${l.meetingAt.slice(11, 16)}` : ""}
              </span>
            ) : (
              <span className="ms-auto text-xs text-muted tabular-nums">{when(l.lastMessageAt ?? l.createdAt)}</span>
            )}
          </div>
          <h3 className="font-bold text-[17px] leading-snug mt-2">{l.title}</h3>
          <p className="text-sm text-muted mt-0.5 truncate">
            {[l.customerName, l.city].filter(Boolean).join(" · ") || l.trade}
          </p>
          {l.nextStep && <p className="text-sm text-ink-2 mt-1.5 line-clamp-1">← {l.nextStep}</p>}
          <DealLine lead={l} />
        </div>
        {thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" loading="lazy" className="size-[72px] rounded-xl object-cover shrink-0 ring-1 ring-line" />
        )}
      </button>
      {phone && !faded && (
        <div className="flex border-t border-line text-sm">
          <a
            data-id="card-call"
            href={`tel:${phone}`}
            className="flex-1 py-2.5 flex items-center justify-center gap-1.5 font-semibold text-harbour hover:bg-paper active:bg-line transition cursor-pointer"
          >
            <PhoneIcon /> <span dir="ltr">{prettyPhone(phone)}</span>
          </a>
          <a
            data-id="card-whatsapp"
            href={`https://wa.me/${intlPhone(phone)}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 py-2.5 flex items-center justify-center gap-1.5 font-semibold text-israel border-s border-line hover:bg-paper active:bg-line transition cursor-pointer"
          >
            <ChatIcon /> וואטסאפ
          </a>
        </div>
      )}
    </article>
  );
}

/** The deal in one line on the card: what the client pays, and what stays with us. */
function DealLine({ lead }: { lead: Lead }) {
  const d = lead.deal;
  const m = margin(d);
  if (d.clientPrice == null && d.subPrice == null) return null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12.5px]">
      {d.clientPrice != null && (
        <span className="rounded-md bg-paper px-2 py-0.5 tabular-nums">
          לקוח <b>{shekel(d.clientPrice)}</b>
        </span>
      )}
      {d.subPrice != null && (
        <span className="rounded-md bg-paper px-2 py-0.5 tabular-nums">
          {d.subName ?? "קבלן משנה"} <b>{shekel(d.subPrice)}</b>
        </span>
      )}
      {m != null && (
        <span className={`rounded-md px-2 py-0.5 font-bold tabular-nums ${m >= 0 ? "bg-[#def5ec] text-[#0b5c47]" : "bg-[#fde8e8] text-[#9b1c1c]"}`}>
          נשאר {shekel(m)}
        </span>
      )}
    </p>
  );
}

function CalGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  );
}

export function PhoneIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
    </svg>
  );
}

export function ChatIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7a11.6 11.6 0 0 1-4.6-4.1c-.4-.5-1-1.5-1-2.8s.7-2 1-2.3c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.2.1.7-.1 1.4Z" />
    </svg>
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
    <section className="pt-6">
      <button
        data-id="unassigned-toggle"
        onClick={() => setShow(!show)}
        className="w-full flex items-center gap-2 text-sm text-muted hover:text-ink cursor-pointer py-2"
      >
        <span className={`transition ${show ? "rotate-90" : ""}`}>‹</span>
        הודעות שלא שויכו לליד
        <span className="rounded-full bg-line px-2 text-xs">{data.unassigned.length}</span>
      </button>
      {show && (
        <ul className="mt-1 space-y-2">
          {data.unassigned.map((m) => (
            <li key={m.id} className="bg-white border border-line rounded-xl p-3 text-sm">
              <div className="text-[11px] text-muted">
                {data.sources.find((s) => s.id === m.source)?.label} · {when(m.sentAt)}
              </div>
              <p className="whitespace-pre-wrap mt-0.5">
                {m.mediaType ? `[${m.mediaType}] ` : ""}
                {m.transcript ?? m.content}
              </p>
              <select
                data-id="unassigned-assign"
                defaultValue=""
                onChange={(e) => e.target.value && assign(m.id, m.chatJid, Number(e.target.value))}
                className="mt-2 rounded-lg border border-line px-2 py-1.5 bg-white cursor-pointer text-sm"
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
