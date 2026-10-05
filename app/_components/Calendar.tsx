"use client";
import { useMemo, useState } from "react";
import { PARTNER_TONE, type BoardData, type Lead } from "./types";

/**
 * The calendar has two colours and they mean two different kinds of commitment:
 *  - GREEN: a meeting with a customer we have no contract with yet — one moment in time.
 *  - RED: the working days of a job that has a contract — a span from start to end.
 */

const DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

type Entry =
  | { kind: "meeting"; lead: Lead; day: string; time: string }
  | { kind: "work"; lead: Lead; day: string; first: boolean; last: boolean; start: string; end: string };

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parse(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function sayDay(day: string): string {
  const d = parse(day);
  return `${["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"][d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`;
}

function entriesByDay(leads: Lead[]): Map<string, Entry[]> {
  const map = new Map<string, Entry[]>();
  const add = (e: Entry) => map.set(e.day, [...(map.get(e.day) ?? []), e]);
  for (const l of leads) {
    if (l.status === "removed") continue;
    if (l.meetingAt) add({ kind: "meeting", lead: l, day: l.meetingAt.slice(0, 10), time: l.meetingAt.slice(11, 16) });
    if (l.workStart) {
      const end = l.workEnd && l.workEnd >= l.workStart ? l.workEnd : l.workStart;
      for (let d = parse(l.workStart); ymd(d) <= end; d.setDate(d.getDate() + 1)) {
        const day = ymd(d);
        add({ kind: "work", lead: l, day, first: day === l.workStart, last: day === end, start: l.workStart, end });
      }
    }
  }
  for (const list of map.values())
    list.sort((a, b) => (a.kind === b.kind ? (a.kind === "meeting" && b.kind === "meeting" ? a.time.localeCompare(b.time) : 0) : a.kind === "work" ? -1 : 1));
  return map;
}

export default function Calendar({ data, onOpen }: { data: BoardData; onOpen: (id: number) => void }) {
  const today = ymd(new Date());
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState(today);
  const byDay = useMemo(() => entriesByDay(data.leads), [data.leads]);

  const cells: (string | null)[] = [];
  for (let i = 0; i < month.getDay(); i++) cells.push(null);
  for (let d = new Date(month); d.getMonth() === month.getMonth(); d.setDate(d.getDate() + 1)) cells.push(ymd(d));
  while (cells.length % 7) cells.push(null);

  const dayEntries = byDay.get(selected) ?? [];
  const upcoming = [...byDay.entries()]
    .filter(([day]) => day >= today)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, es]) => es.filter((e) => e.kind === "meeting" || e.first))
    .slice(0, 6);

  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-line overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3">
          <button data-id="cal-prev" onClick={() => shift(-1)} className="size-9 rounded-full hover:bg-paper grid place-items-center text-xl cursor-pointer" aria-label="החודש הקודם">
            ›
          </button>
          <h2 className="font-extrabold text-lg min-w-32 text-center">
            {MONTHS[month.getMonth()]} {month.getFullYear()}
          </h2>
          <button data-id="cal-next" onClick={() => shift(1)} className="size-9 rounded-full hover:bg-paper grid place-items-center text-xl cursor-pointer" aria-label="החודש הבא">
            ‹
          </button>
          <button
            data-id="cal-today"
            onClick={() => {
              const d = new Date();
              setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
              setSelected(today);
            }}
            className="ms-auto rounded-full border border-line px-3 py-1 text-sm hover:border-harbour-2 hover:text-harbour cursor-pointer"
          >
            היום
          </button>
        </div>
        <div className="flex gap-4 px-4 pb-2 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#16a34a]" />פגישה (לפני חוזה)</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-sm bg-[#dc2626]" />עבודה (יש חוזה)</span>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] text-muted border-t border-line">
          {DAYS.map((d) => (
            <div key={d} className="py-1.5">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 border-t border-line">
          {cells.map((day, i) => {
            if (!day) return <div key={`x${i}`} className="min-h-20 bg-paper/50 border-b border-line" />;
            const es = byDay.get(day) ?? [];
            const isSel = day === selected;
            const isToday = day === today;
            return (
              <button
                key={day}
                data-id="cal-day"
                onClick={() => setSelected(day)}
                className={`min-h-20 border-b border-line text-start p-1 flex flex-col gap-0.5 cursor-pointer transition ${isSel ? "bg-[#eef6fc]" : "hover:bg-paper"}`}
              >
                <span
                  className={`self-start text-xs size-6 grid place-items-center rounded-full ${
                    isToday ? "bg-harbour text-white font-bold" : isSel ? "font-bold text-ink" : "text-ink-2"
                  }`}
                >
                  {Number(day.slice(8))}
                </span>
                {es.slice(0, 3).map((e, j) =>
                  e.kind === "work" ? (
                    <span
                      key={j}
                      className={`h-4 bg-[#dc2626] text-white text-[10px] leading-4 px-1 truncate ${e.first ? "rounded-s-md" : "-ms-1"} ${e.last ? "rounded-e-md" : "-me-1"}`}
                    >
                      {e.first ? e.lead.title.split("–")[0] : " "}
                    </span>
                  ) : (
                    <span key={j} className="text-[10px] leading-4 px-1 rounded-md bg-[#dcfce7] text-[#166534] truncate font-semibold">
                      {e.time} {e.lead.customerName ?? e.lead.city ?? ""}
                    </span>
                  ),
                )}
                {es.length > 3 && <span className="text-[10px] text-muted px-1">+{es.length - 3}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <section>
        <h3 className="text-[13px] font-bold text-ink-2 mb-2">{selected === today ? "היום" : sayDay(selected)}</h3>
        {dayEntries.length ? (
          <div className="space-y-2">
            {dayEntries.map((e, i) => (
              <EntryRow key={i} e={e} onOpen={onOpen} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted bg-white border border-line rounded-xl px-4 py-3">אין כלום ביום הזה.</p>
        )}
      </section>

      {upcoming.length > 0 && (
        <section>
          <h3 className="text-[13px] font-bold text-ink-2 mb-2">הקרובים</h3>
          <div className="space-y-2">
            {upcoming.map((e, i) => (
              <EntryRow key={i} e={e} onOpen={onOpen} withDay />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function EntryRow({ e, onOpen, withDay }: { e: Entry; onOpen: (id: number) => void; withDay?: boolean }) {
  const meeting = e.kind === "meeting";
  const tone = PARTNER_TONE[e.lead.source];
  return (
    <button
      data-id="cal-entry"
      onClick={() => onOpen(e.lead.id)}
      className="w-full text-start bg-white rounded-xl border border-line overflow-hidden flex hover:shadow-md transition cursor-pointer"
    >
      <span className={`w-1.5 ${meeting ? "bg-[#16a34a]" : "bg-[#dc2626]"}`} />
      <div className="flex-1 px-3 py-2.5 min-w-0">
        <div className="flex items-center gap-2 text-xs">
          <span className={`font-bold ${meeting ? "text-[#166534]" : "text-[#991b1b]"}`}>
            {meeting
              ? `פגישה${withDay ? ` · ${sayDay(e.day)}` : ""} · ${e.time}`
              : `עבודה · ${sayDay(e.start)}${e.end !== e.start ? ` – ${sayDay(e.end)}` : ""}`}
          </span>
          <span className={`ms-auto size-5 rounded-full grid place-items-center text-[10px] font-bold ${tone?.chip}`}>{tone?.initial}</span>
        </div>
        <div className="font-semibold mt-0.5 truncate">{e.lead.title}</div>
        {(e.lead.customerName || e.lead.address || e.lead.city) && (
          <div className="text-sm text-muted truncate">{[e.lead.customerName, e.lead.address ?? e.lead.city].filter(Boolean).join(" · ")}</div>
        )}
      </div>
    </button>
  );
}
