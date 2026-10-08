"use client";
import { useEffect, useState } from "react";
import { ChatIcon, PhoneIcon } from "./Board";
import DealCard from "./DealCard";
import SplitCard from "./SplitCard";
import ScheduleCard from "./ScheduleCard";
import ShareCard from "./ShareCard";
import LeadVoice from "./LeadVoice";
import {
  PARTNER_TONE,
  STATES,
  STATUS_TONE,
  daysFromToday,
  intlPhone,
  shortDay,
  prettyPhone,
  wazeUrl,
  when,
  type BoardData,
  type Lead,
  type LeadEvent,
  type Msg,
  type Proposal,
} from "./types";

type Item = { at: string; kind: "msg"; m: Msg } | { at: string; kind: "event"; e: LeadEvent };

/** The history's order is this viewer's preference, kept in this browser only. Default: oldest first. */
const ORDER_KEY = "ourleads.timeline.newestFirst";
function readNewestFirst(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(ORDER_KEY) === "1";
  } catch {
    return false;
  }
}
function saveNewestFirst(v: boolean) {
  try {
    window.localStorage.setItem(ORDER_KEY, v ? "1" : "0");
  } catch {
    // Storage blocked (private window): the choice lasts until the panel closes.
  }
}

export default function LeadDetail({
  lead,
  data,
  onClose,
  onChanged,
}: {
  lead: Lead;
  data: BoardData;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newestFirst, setNewestFirst] = useState(readNewestFirst);
  const source = data.sources.find((s) => s.id === lead.source);
  const partner = source?.actor ?? "שותף";
  const place = [lead.address, lead.city].filter(Boolean).join(", ");
  const photos = lead.messages.filter((m) => m.mediaType === "image" && m.mediaUrl).map((m) => m.mediaUrl!);
  const label = (id: string) => data.statuses.find((s) => s.id === id)?.label ?? id;

  // Opening a lead touches it ("נגיעה אחרונה קודם" on the board). Fire and forget: a lost mark only misorders the list.
  useEffect(() => {
    void fetch(`/api/leads/${lead.id}/viewed`, { method: "POST" }).catch(() => {});
  }, [lead.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (photo ? setPhoto(null) : sharing ? setSharing(false) : onClose());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photo, sharing, onClose]);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? `HTTP ${res.status}`);
      return false;
    }
    if ("note" in body) setNote("");
    onChanged();
    return true;
  }
  // Photos from a site visit go straight onto the lead — never through the WhatsApp chat,
  // where the extractor would read them as a new lead.
  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    const form = new FormData();
    for (const f of Array.from(files)) form.append("photo", f);
    const res = await fetch(`/api/leads/${lead.id}/photos`, { method: "POST", body: form });
    setUploading(false);
    if (!res.ok) return setError((await res.json()).error ?? `HTTP ${res.status}`);
    onChanged();
  }
  async function resolveProposal(accept: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/leads/${lead.id}/proposal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accept }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json()).error ?? `HTTP ${res.status}`);
    onChanged();
  }
  const setStatus = (s: string) => s !== lead.status && !busy && patch({ status: s, note: note.trim() || undefined });

  // One story: what was said on WhatsApp and what was done about it, in the order the viewer chose.
  const timeline: Item[] = [
    ...lead.messages.filter((m) => m.mediaType !== "image").map((m) => ({ at: m.sentAt, kind: "msg" as const, m })),
    ...lead.events.map((e) => ({ at: e.at, kind: "event" as const, e })),
  ].sort((a, b) => (newestFirst ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at)));

  return (
    <div className="fixed inset-0 z-40 flex justify-start bg-ink/40 backdrop-blur-[2px]" onClick={onClose}>
      <aside
        className="sheet w-full max-w-xl h-full overflow-y-auto bg-paper shadow-2xl pb-40"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hero: the place, as Dudu photographed it. */}
        <div className="relative band text-white">
          {photos.length > 0 && (
            <div className="flex gap-1 overflow-x-auto no-scrollbar snap-x h-56">
              {photos.map((src) => (
                <button
                  key={src}
                  data-id="lead-photo"
                  onClick={() => setPhoto(src)}
                  className="snap-start shrink-0 h-full cursor-zoom-in"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-auto max-w-none object-cover" />
                </button>
              ))}
            </div>
          )}
          <div className={`${photos.length ? "absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0b2236] via-[#0b2236]/80 to-transparent pt-16" : "pt-14"} px-5 pb-4`}>
            <div className="flex items-center gap-2 text-xs text-white/80">
              <span className={`size-5 rounded-full grid place-items-center text-[11px] font-bold ${PARTNER_TONE[lead.source]?.chip}`}>
                {PARTNER_TONE[lead.source]?.initial}
              </span>
              {source?.label} · #{lead.id}
            </div>
            <h2 className="text-2xl font-extrabold leading-tight mt-1.5">{lead.title}</h2>
            {(lead.customerName || place) && (
              <p className="text-white/80 mt-1 text-sm">{[lead.customerName, place].filter(Boolean).join(" · ")}</p>
            )}
          </div>
          <button
            data-id="lead-close"
            onClick={onClose}
            className="absolute top-3 end-3 size-10 rounded-full bg-black/35 hover:bg-black/55 backdrop-blur grid place-items-center text-xl cursor-pointer transition"
            aria-label="סגירה"
          >
            ×
          </button>
          <button
            data-id="lead-share"
            onClick={() => setSharing(true)}
            className="absolute top-3 end-15 h-10 px-4 rounded-full bg-black/35 hover:bg-black/55 backdrop-blur flex items-center gap-1.5 text-sm font-semibold cursor-pointer transition"
            title="שליחת הכרטיס בקישור — וואטסאפ, מייל, כל אחד"
          >
            <ShareIcon />
            שתף
          </button>
          <label
            data-id="lead-add-photos"
            className={`absolute top-3 end-[8.5rem] h-10 px-4 rounded-full bg-black/35 hover:bg-black/55 backdrop-blur flex items-center gap-1.5 text-sm font-semibold transition ${uploading ? "cursor-wait opacity-60" : "cursor-pointer"}`}
            title="הוספת תמונות מהביקור — ישר לליד, בלי וואטסאפ"
          >
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={uploading}
              className="hidden"
              onChange={(e) => {
                void addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
            {uploading ? "מעלה…" : "+ תמונות"}
          </label>
        </div>

        <section className="px-4 -mt-0 pt-4 space-y-4">
          {lead.proposal && <ProposalCard p={lead.proposal} busy={busy} onResolve={resolveProposal} />}
          {/* The three things you do with a lead. */}
          <div className="grid grid-cols-3 gap-2">
            <Action
              id="lead-call"
              href={lead.phones[0] ? `tel:${lead.phones[0]}` : undefined}
              icon={<PhoneIcon className="size-5" />}
              label="התקשר"
              tone="text-harbour"
            />
            <Action
              id="lead-whatsapp"
              href={lead.phones[0] ? `https://wa.me/${intlPhone(lead.phones[0])}` : undefined}
              icon={<ChatIcon className="size-5" />}
              label="וואטסאפ"
              tone="text-israel"
              external
            />
            <Action
              id="lead-waze"
              href={place ? wazeUrl(place) : undefined}
              icon={<NavIcon />}
              label="נווט"
              tone="text-[#2a6fd6]"
              external
            />
          </div>
          {/* Talk about this lead — first thing under the actions, not below the fold. */}
          <LeadVoice leadId={lead.id} onChanged={onChanged} />
          {lead.phones.length > 1 && (
            <div className="flex flex-wrap gap-2 text-sm">
              {lead.phones.slice(1).map((p) => (
                <a key={p} data-id="lead-call-other" href={`tel:${p}`} className="rounded-full bg-white border border-line px-3 py-1 hover:border-harbour-2 cursor-pointer" dir="ltr">
                  {prettyPhone(p)}
                </a>
              ))}
            </div>
          )}

          {/* Where the lead stands — a meeting or work can be set with or without a date. */}
          <div className="bg-white rounded-2xl border border-line p-3 flex items-center gap-2">
            {lead.status === "removed" ? (
              <>
                <span className="flex-1 text-sm text-muted px-1">הליד הוסר מהלוח</span>
                <button
                  data-id="lead-restore"
                  disabled={busy}
                  onClick={() => setStatus("none")}
                  className="rounded-full px-4 py-2 text-sm font-semibold bg-harbour text-white hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                >
                  החזר ללוח
                </button>
              </>
            ) : (
              <>
                <div className="flex-1 grid grid-cols-3 gap-1 rounded-xl bg-paper p-1">
                  {STATES.map((s) => (
                    <button
                      key={s}
                      data-id={`lead-status-${s}`}
                      disabled={busy}
                      onClick={() => setStatus(s)}
                      className={`rounded-lg py-2 text-sm transition cursor-pointer disabled:cursor-wait flex items-center justify-center gap-1.5 ${
                        s === lead.status ? `${STATUS_TONE[s].pill} font-bold shadow-sm` : "text-muted hover:text-ink hover:bg-white"
                      }`}
                    >
                      <span className={`size-2 rounded-full ${STATUS_TONE[s].dot}`} />
                      {label(s)}
                    </button>
                  ))}
                </div>
                <button
                  data-id="lead-remove"
                  disabled={busy}
                  onClick={() => setStatus("removed")}
                  title="הסר מהלוח — הליד ירד או שהעבודה הסתיימה"
                  className="rounded-full px-3 py-2 text-sm text-muted border border-line hover:text-[#b91c1c] hover:border-[#fca5a5] cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                >
                  הסר
                </button>
              </>
            )}
          </div>

          {/* Whose move it is. Passing the ball says "I've done my part — it's yours until
              you pass it back". Separate from the status: a lead at פגישה can be in either hands.
              The customer is the third place: we wait for him until a day, then it is both partners' move. */}
          {data.people.length > 0 && (
            <div className="bg-white rounded-2xl border border-line p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-ink-2 px-1">הכדור אצל</span>
                <div className="flex-1 grid gap-1 rounded-xl bg-paper p-1" style={{ gridTemplateColumns: `repeat(${data.people.length + 2}, minmax(0, 1fr))` }}>
                  {[...data.people, data.customer, { id: null, name: "אף אחד" }].map((p) => (
                    <button
                      key={p.id ?? "nobody"}
                      data-id={`lead-holder-${p.id ?? "nobody"}`}
                      disabled={busy}
                      onClick={() => p.id !== (lead.holder ?? null) && !busy && patch({ holder: p.id })}
                      className={`rounded-lg py-2 text-sm transition cursor-pointer disabled:cursor-wait ${
                        p.id === (lead.holder ?? null)
                          ? p.id === null
                            ? "bg-white text-ink font-bold shadow-sm"
                            : p.id === data.customer.id
                            ? "bg-amber text-white font-bold shadow-sm"
                            : "bg-harbour text-white font-bold shadow-sm"
                          : "text-muted hover:text-ink hover:bg-white"
                      }`}
                    >
                      {p.id === data.me.id ? `${p.name} (אני)` : p.name}
                    </button>
                  ))}
                </div>
              </div>
              {lead.holder === data.customer.id && (
                <div className={`rounded-xl px-3 py-2.5 text-sm ${lead.checkBackDue ? "bg-amber text-white" : "bg-amber-soft text-[#8a4a0b]"}`}>
                  <p className="font-semibold">
                    {lead.checkBackDue
                      ? "הגיע הזמן לבדוק עם הלקוח — זה אצל שנינו. מי שמדבר איתו לוקח את הכדור."
                      : `מחכים ללקוח. ${lead.checkBackAt ? `ב${shortDay(lead.checkBackAt)}` : "בעוד כמה ימים"} זה חוזר לשנינו.`}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className={lead.checkBackDue ? "text-white/85" : "text-[#8a4a0b]/80"}>{lead.checkBackDue ? "לתת לו עוד:" : "לבדוק איתו:"}</span>
                    {[
                      { days: 1, label: "מחר" },
                      { days: 3, label: "3 ימים" },
                      { days: 7, label: "שבוע" },
                    ].map((o) => (
                      <button
                        key={o.days}
                        data-id={`lead-check-back-${o.days}`}
                        disabled={busy}
                        onClick={() => patch({ checkBackAt: daysFromToday(o.days) })}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-wait ${
                          lead.checkBackDue ? "bg-white/20 hover:bg-white/30 text-white" : "bg-white hover:bg-[#fff7ed] text-[#8a4a0b] border border-[#f5c58a]"
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                    <input
                      data-id="lead-check-back-date"
                      type="date"
                      disabled={busy}
                      min={daysFromToday(0)}
                      value={lead.checkBackAt ?? ""}
                      onChange={(e) => e.target.value && patch({ checkBackAt: e.target.value })}
                      className="rounded-lg border border-[#f5c58a] bg-white px-2 py-1 text-xs text-ink outline-none cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <ScheduleCard key={`s${lead.id}-${lead.meetingAt}-${lead.workStart}-${lead.workEnd}`} lead={lead} busy={busy} onSave={(b) => patch(b)} />

          <DealCard key={lead.id} deal={lead.deal} busy={busy} onSave={(d) => patch(d)} />

          <SplitCard lead={lead} data={data} busy={busy} onSave={(b) => patch(b)} />

          <div className="bg-white rounded-2xl border border-line divide-y divide-line">
            {lead.nextStep && <Fact k="הצעד הבא" v={lead.nextStep} strong />}
            {lead.visitAt && !lead.meetingAt && <Fact k="ביקור" v={lead.visitAt} />}
            <EditFact id="lead-title" k="כותרת" v={lead.title} busy={busy} onSave={(v) => (v ? patch({ title: v }) : Promise.resolve(false))} />
            <EditFact id="lead-trade" k="עבודה" v={lead.trade} busy={busy} onSave={(v) => patch({ trade: v })} />
            <EditFact id="lead-customer" k="לקוח" v={lead.customerName} busy={busy} onSave={(v) => patch({ customerName: v })} />
            {place && <Fact k="כתובת" v={place} />}
            {lead.details && <p className="p-4 leading-relaxed text-[15px] text-ink-2">{lead.details}</p>}
          </div>

          <div className="flex gap-2">
            <input
              data-id="lead-note-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && note.trim() && patch({ note })}
              placeholder="הוסיפו הערה…"
              className="flex-1 rounded-xl border border-line px-4 py-3 bg-white outline-none focus:border-harbour-2 focus:ring-4 focus:ring-harbour-2/10 transition"
            />
            <button
              data-id="lead-note-save"
              disabled={busy || !note.trim()}
              onClick={() => patch({ note })}
              className="rounded-xl px-5 bg-harbour text-white font-semibold hover:bg-harbour-2 cursor-pointer transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              שמור
            </button>
          </div>
          {error && <p className="text-red-700 text-sm">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            <h3 className="text-[13px] font-bold text-ink-2">מה קרה עד עכשיו</h3>
            <div className="inline-flex rounded-full bg-white border border-line p-0.5 text-xs">
              {(
                [
                  [true, "חדש קודם"],
                  [false, "ישן קודם"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={label}
                  data-id={v ? "timeline-newest-first" : "timeline-oldest-first"}
                  onClick={() => {
                    setNewestFirst(v);
                    saveNewestFirst(v);
                  }}
                  className={`rounded-full px-3 py-1 cursor-pointer transition ${newestFirst === v ? "bg-harbour text-white font-semibold" : "text-muted hover:text-ink"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <ol className="relative space-y-3 before:absolute before:inset-y-2 before:start-[15px] before:w-px before:bg-line">
            {timeline.map((it) =>
              it.kind === "msg" ? (
                <MessageRow key={`m${it.m.id}`} m={it.m} partner={partner} customer={lead.customerName ?? "הלקוח"} />
              ) : (
                <EventRow key={`e${it.e.id}`} e={it.e} onChanged={onChanged} />
              ),
            )}
          </ol>
        </section>
      </aside>

      {sharing && <ShareCard lead={lead} onClose={() => setSharing(false)} onChanged={onChanged} />}

      {photo && (
        <button
          data-id="photo-close"
          className="fixed inset-0 z-50 bg-black/90 cursor-zoom-out"
          onClick={(e) => {
            e.stopPropagation();
            setPhoto(null);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="" className="h-full w-full object-contain" />
        </button>
      )}
    </div>
  );
}

function Action({
  id,
  href,
  icon,
  label,
  tone,
  external,
}: {
  id: string;
  href?: string;
  icon: React.ReactNode;
  label: string;
  tone: string;
  external?: boolean;
}) {
  const cls = "rounded-2xl bg-white border border-line py-3 flex flex-col items-center gap-1 text-sm font-semibold transition";
  if (!href)
    return (
      <span data-id={id} className={`${cls} text-muted/50 cursor-not-allowed`}>
        {icon}
        {label}
      </span>
    );
  return (
    <a
      data-id={id}
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className={`${cls} ${tone} hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 cursor-pointer`}
    >
      {icon}
      {label}
    </a>
  );
}

/** A detail row that turns into a text box when tapped — the way to correct what the extractor got wrong. */
function EditFact({ id, k, v, busy, onSave }: { id: string; k: string; v: string | null; busy: boolean; onSave: (v: string | null) => Promise<boolean> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const save = async () => {
    if (draft === null) return;
    const next = draft.trim() || null;
    if (next === v || (await onSave(next))) setDraft(null);
  };
  if (draft === null)
    return (
      <button
        data-id={`${id}-edit`}
        onClick={() => setDraft(v ?? "")}
        className="w-full flex gap-3 px-4 py-3 text-sm text-start hover:bg-paper cursor-pointer transition group"
      >
        <span className="text-muted w-20 shrink-0">{k}</span>
        <span className={`min-w-0 flex-1 ${v ? "text-ink-2" : "text-muted"}`}>{v ?? "—"}</span>
        <span className="text-muted/60 group-hover:text-harbour-2 text-xs self-center">שנה</span>
      </button>
    );
  return (
    <div className="flex gap-2 px-4 py-2.5 text-sm items-center">
      <span className="text-muted w-20 shrink-0">{k}</span>
      <input
        data-id={`${id}-input`}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setDraft(null);
        }}
        className="flex-1 min-w-0 rounded-lg border border-line px-3 py-2 bg-white outline-none focus:border-harbour-2 focus:ring-4 focus:ring-harbour-2/10"
      />
      <button
        data-id={`${id}-save`}
        disabled={busy}
        onClick={save}
        className="rounded-lg px-3 py-2 bg-harbour text-white font-semibold hover:bg-harbour-2 cursor-pointer transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        שמור
      </button>
      <button data-id={`${id}-cancel`} onClick={() => setDraft(null)} className="rounded-lg px-2 py-2 text-muted hover:text-ink cursor-pointer transition">
        ביטול
      </button>
    </div>
  );
}

/** The customer's chat suggests moving the lead. It moves only when one of us taps אשר. */
function ProposalCard({ p, busy, onResolve }: { p: Proposal; busy: boolean; onResolve: (accept: boolean) => void }) {
  return (
    <div data-id="lead-proposal" className="rounded-2xl border border-amber/40 bg-amber-soft p-4">
      <div className="text-[11px] font-semibold text-amber mb-1">מהשיחה עם {p.who} · {when(p.at)}</div>
      <p className="text-sm text-ink-2">{p.why}</p>
      <p className="mt-2 text-sm font-bold text-ink">
        להעביר ל: <span className="text-harbour">{p.summary}</span>?
      </p>
      <div className="mt-3 flex gap-2">
        <button
          data-id="proposal-accept"
          disabled={busy}
          onClick={() => onResolve(true)}
          className="h-10 px-5 rounded-full bg-harbour text-white text-sm font-semibold hover:bg-harbour-2 active:scale-[.98] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          אשר
        </button>
        <button
          data-id="proposal-reject"
          disabled={busy}
          onClick={() => onResolve(false)}
          className="h-10 px-5 rounded-full bg-white border border-line text-ink-2 text-sm font-semibold hover:bg-paper active:scale-[.98] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          לא עכשיו
        </button>
      </div>
    </div>
  );
}

function Fact({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex gap-3 px-4 py-3 text-sm">
      <span className="text-muted w-20 shrink-0">{k}</span>
      <span className={`min-w-0 ${strong ? "font-semibold text-ink" : "text-ink-2"}`}>{v}</span>
    </div>
  );
}

function MessageRow({ m, partner, customer }: { m: Msg; partner: string; customer: string }) {
  return (
    <li className="relative ps-10">
      <span className={`absolute start-2 top-3 size-4 rounded-full border-2 border-paper ${m.fromMe ? "bg-israel" : "bg-sky"}`} />
      <div className={`rounded-2xl px-3.5 py-2.5 text-sm border ${m.fromMe ? "bg-[#ecf8f3] border-[#cdeee0]" : "bg-white border-line"}`}>
        <div className="text-[11px] text-muted mb-1">
          {m.fromMe ? "אני" : m.fromCustomer ? customer : partner} · {when(m.sentAt)} · וואטסאפ
        </div>
        {m.mediaType === "video" && m.mediaUrl && (
          <video data-id="message-video" src={m.mediaUrl} controls preload="metadata" className="rounded-xl max-h-72 w-full bg-black" />
        )}
        {m.mediaType === "audio" && (
          <div className="space-y-1.5">
            {m.mediaUrl && <audio data-id="message-audio" src={m.mediaUrl} controls preload="none" className="w-full h-9" />}
            {m.transcript && <p className="leading-relaxed text-ink-2">״{m.transcript}״</p>}
          </div>
        )}
        {m.mediaType && !m.mediaUrl && <p className="text-muted italic">[{m.mediaType} — {m.error ? "לא ירד" : "בהורדה"}]</p>}
        {m.content && <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>}
      </div>
    </li>
  );
}

/**
 * One history line. Hovering shows edit and delete: a line can be corrected or
 * taken off (delete takes a second tap). The server keeps a removed line, with
 * who removed it, and marks an edited one — two partners share this history.
 */
function EventRow({ e, onChanged }: { e: LeadEvent; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(e.text ?? "");
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "PATCH" | "DELETE", body?: object) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/events/${e.id}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
    setEditing(false);
    onChanged();
  }

  function remove() {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 4000);
      return;
    }
    setArmed(false);
    void call("DELETE");
  }

  return (
    <li className="group relative ps-10 text-sm">
      <span className="absolute start-[9px] top-1.5 size-3.5 rounded-full bg-harbour border-2 border-paper" />
      <div className="flex items-center gap-2 text-[11px] text-muted">
        <span>
          {when(e.at)} · {e.who}
          {e.editedBy && ` · נערך ע״י ${e.editedBy}`}
        </span>
        {!editing && (
          <span className={`ms-auto flex gap-1 transition ${armed ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`}>
            <button
              data-id="event-edit"
              disabled={busy}
              onClick={() => {
                setText(e.text ?? "");
                setEditing(true);
              }}
              className="rounded-full px-2 py-0.5 border border-line bg-white hover:border-harbour-2 hover:text-ink cursor-pointer transition disabled:opacity-50"
            >
              ערוך
            </button>
            <button
              data-id="event-delete"
              disabled={busy}
              onClick={remove}
              className={`rounded-full px-2 py-0.5 border cursor-pointer transition disabled:opacity-50 ${
                armed ? "bg-[#b91c1c] border-[#b91c1c] text-white" : "border-line bg-white hover:text-[#b91c1c] hover:border-[#fca5a5]"
              }`}
            >
              {armed ? "לחצו שוב למחיקה" : "מחק"}
            </button>
          </span>
        )}
      </div>
      {e.to && (
        <p className="mt-0.5">
          {e.from ? <span className="text-muted">{e.from} ← </span> : null}
          <b>{e.to}</b>
        </p>
      )}
      {editing ? (
        <div className="mt-1 space-y-1.5">
          <textarea
            data-id="event-edit-text"
            autoFocus
            value={text}
            onChange={(ev) => setText(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Escape") setEditing(false);
              if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey) && text.trim()) void call("PATCH", { text });
            }}
            rows={Math.min(6, Math.max(2, Math.ceil(text.length / 60)))}
            className="w-full rounded-xl border border-line px-3 py-2 bg-white outline-none focus:border-harbour-2 focus:ring-4 focus:ring-harbour-2/10 transition"
          />
          <div className="flex gap-2">
            <button
              data-id="event-edit-save"
              disabled={busy || !text.trim()}
              onClick={() => call("PATCH", { text })}
              className="rounded-lg px-3 py-1 bg-harbour text-white font-semibold hover:bg-harbour-2 cursor-pointer transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              שמור
            </button>
            <button
              data-id="event-edit-cancel"
              onClick={() => setEditing(false)}
              className="rounded-lg px-3 py-1 border border-line bg-white hover:border-harbour-2 cursor-pointer transition"
            >
              ביטול
            </button>
          </div>
        </div>
      ) : (
        e.text && <p className="text-ink-2 mt-0.5 leading-relaxed">{e.text}</p>
      )}
      {error && <p className="text-red-700 text-xs mt-1">{error}</p>}
    </li>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}

function NavIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <path d="M12 2 4.5 20.3l.7.7L12 18l6.8 3 .7-.7z" />
    </svg>
  );
}
