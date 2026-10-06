import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cardView, type CardView } from "@/lib/shares";
import { money, sayWhen } from "@/lib/deal";
import { STATUS_TONE, intlPhone, prettyPhone, wazeUrl } from "@/app/_components/types";
import Photos from "./Photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One lead, opened from a link — no sign-in, no board around it. Whoever has the
 * link sees exactly what the sender left in (lib/shares.ts), and the page reads the
 * lead live, so a status or date changed after sending shows here too.
 */
export const metadata: Metadata = { title: "כרטיס ליד", robots: { index: false, follow: false } };

export default async function CardPage({ params }: PageProps<"/c/[token]">) {
  const card = cardView((await params).token);
  if (!card) notFound();
  if (card.revoked)
    return (
      <main className="min-h-dvh grid place-items-center p-6 text-center">
        <div>
          <h1 className="text-xl font-bold">הקישור בוטל</h1>
          <p className="text-muted mt-2">מי ששלח את הכרטיס ביטל את הקישור הזה.</p>
        </div>
      </main>
    );
  return <Card c={card} />;
}

function Card({ c }: { c: Exclude<CardView, { revoked: true }> }) {
  const place = [c.address, c.city].filter(Boolean).join(", ");
  const phone = c.phones[0];
  const tone = STATUS_TONE[c.status] ?? STATUS_TONE.none;
  const work = c.workStart ? `${sayWhen(c.workStart)}${c.workEnd && c.workEnd !== c.workStart ? ` – ${sayWhen(c.workEnd)}` : ""}` : null;
  const client = c.deal ? money(c.deal.clientPrice, c.deal.clientVat === null ? null : c.deal.clientVat ? 1 : 0) : null;
  const sub = c.deal ? money(c.deal.subPrice, c.deal.subVat === null ? null : c.deal.subVat ? 1 : 0) : null;
  const subWho = c.deal ? [c.deal.subName, c.deal.subPhone].filter(Boolean).join(" · ") : "";

  return (
    <main className="min-h-dvh bg-paper">
      <article className="mx-auto max-w-xl pb-16">
        <header className="relative band text-white">
          {c.photos.length > 0 && <Photos photos={c.photos} />}
          <div className={`${c.photos.length ? "absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0b2236] via-[#0b2236]/80 to-transparent pt-16 pointer-events-none" : "pt-10"} px-5 pb-4`}>
            <div className="text-xs text-white/80">{c.sourceLabel}</div>
            <h1 className="text-2xl font-extrabold leading-tight mt-1.5">{c.title}</h1>
            {(c.customerName || place) && <p className="text-white/80 mt-1 text-sm">{[c.customerName, place].filter(Boolean).join(" · ")}</p>}
          </div>
        </header>

        <section className="px-4 pt-4 space-y-4">
          {(phone || place) && (
            <div className={`grid gap-2 ${phone && place ? "grid-cols-3" : phone ? "grid-cols-2" : "grid-cols-1"}`}>
              {phone && <Action id="card-call" href={`tel:${phone}`} label="התקשר" tone="text-harbour" />}
              {phone && <Action id="card-whatsapp" href={`https://wa.me/${intlPhone(phone)}`} label="וואטסאפ" tone="text-israel" external />}
              {place && <Action id="card-waze" href={wazeUrl(place)} label="נווט" tone="text-[#2a6fd6]" external />}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-line divide-y divide-line">
            <div className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="text-muted w-20 shrink-0">מצב</span>
              <span className={`rounded-full px-3 py-0.5 font-semibold ${tone.pill}`}>{c.statusLabel}</span>
            </div>
            {c.meetingAt && <Fact k="פגישה" v={sayWhen(c.meetingAt)} strong />}
            {work && <Fact k="ימי עבודה" v={work} strong />}
            {c.nextStep && <Fact k="הצעד הבא" v={c.nextStep} strong />}
            {c.trade && <Fact k="עבודה" v={c.trade} />}
            {c.customerName && <Fact k="לקוח" v={c.customerName} />}
            {c.phones.map((p) => (
              <Fact key={p} k="טלפון" v={prettyPhone(p)} ltr />
            ))}
            {place && <Fact k="כתובת" v={place} />}
            {c.details && <p className="p-4 leading-relaxed text-[15px] text-ink-2 whitespace-pre-wrap">{c.details}</p>}
          </div>

          {(client || sub || subWho) && (
            <div className="bg-white rounded-2xl border border-line divide-y divide-line">
              {client && <Fact k="מול הלקוח" v={client} />}
              {(sub || subWho) && <Fact k="קבלן משנה" v={[subWho, sub].filter(Boolean).join(" · ")} />}
            </div>
          )}

          {c.timeline.length > 0 && (
            <>
              <h2 className="text-[13px] font-bold text-ink-2 pt-2">מה קרה עד עכשיו</h2>
              <ol className="relative space-y-3 before:absolute before:inset-y-2 before:start-[15px] before:w-px before:bg-line">
                {c.timeline.map((it, i) =>
                  it.kind === "msg" ? (
                    <li key={`m${it.m.id}`} className="relative ps-10">
                      <span className={`absolute start-2 top-3 size-4 rounded-full border-2 border-paper ${it.m.fromMe ? "bg-israel" : "bg-sky"}`} />
                      <div className={`rounded-2xl px-3.5 py-2.5 text-sm border ${it.m.fromMe ? "bg-[#ecf8f3] border-[#cdeee0]" : "bg-white border-line"}`}>
                        <div className="text-[11px] text-muted mb-1">
                          {it.m.fromMe ? "יניב" : c.partner} · {stamp(it.m.sentAt)}
                        </div>
                        {it.m.mediaType === "video" && it.m.mediaUrl && (
                          <video data-id="card-video" src={it.m.mediaUrl} controls preload="metadata" className="rounded-xl max-h-72 w-full bg-black" />
                        )}
                        {it.m.mediaType === "audio" && it.m.mediaUrl && <audio data-id="card-audio" src={it.m.mediaUrl} controls preload="none" className="w-full h-9" />}
                        {it.m.transcript && <p className="leading-relaxed text-ink-2">״{it.m.transcript}״</p>}
                        {it.m.content && <p className="whitespace-pre-wrap leading-relaxed">{it.m.content}</p>}
                      </div>
                    </li>
                  ) : (
                    <li key={`e${i}`} className="relative ps-10 text-sm">
                      <span className="absolute start-[9px] top-1.5 size-3.5 rounded-full bg-harbour border-2 border-paper" />
                      <div className="text-[11px] text-muted">
                        {stamp(it.e.at)} · {it.e.who}
                      </div>
                      {it.e.to && (
                        <p className="mt-0.5">
                          {it.e.from ? <span className="text-muted">{it.e.from} ← </span> : null}
                          <b>{it.e.to}</b>
                        </p>
                      )}
                      {it.e.text && <p className="text-ink-2 mt-0.5 leading-relaxed">{it.e.text}</p>}
                    </li>
                  ),
                )}
              </ol>
            </>
          )}
        </section>
      </article>
    </main>
  );
}

/** Server-rendered, so the time is Israel's, not the server's. */
function stamp(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Action({ id, href, label, tone, external }: { id: string; href: string; label: string; tone: string; external?: boolean }) {
  return (
    <a
      data-id={id}
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className={`rounded-2xl bg-white border border-line py-3.5 text-center text-sm font-semibold transition ${tone} hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 cursor-pointer`}
    >
      {label}
    </a>
  );
}

function Fact({ k, v, strong, ltr }: { k: string; v: string; strong?: boolean; ltr?: boolean }) {
  return (
    <div className="flex gap-3 px-4 py-3 text-sm">
      <span className="text-muted w-20 shrink-0">{k}</span>
      <span className={`min-w-0 ${strong ? "font-semibold text-ink" : "text-ink-2"}`} dir={ltr ? "ltr" : undefined}>
        {v}
      </span>
    </div>
  );
}
