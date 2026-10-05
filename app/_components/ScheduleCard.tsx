"use client";
import { useState } from "react";
import { sayDay } from "./Calendar";
import type { Lead } from "./types";

/**
 * Put a lead on the calendar. Green: a meeting with a customer we have no contract with.
 * Red: the working days once there is a contract. Setting them moves the lead forward
 * (meeting → visit set, working days → closed) on the server.
 */
export default function ScheduleCard({
  lead,
  busy,
  onSave,
}: {
  lead: Lead;
  busy: boolean;
  onSave: (body: Record<string, string | null>) => Promise<boolean>;
}) {
  const [meeting, setMeeting] = useState(lead.meetingAt ?? "");
  const [start, setStart] = useState(lead.workStart ?? "");
  const [end, setEnd] = useState(lead.workEnd ?? "");
  const dirtyMeeting = meeting !== (lead.meetingAt ?? "");
  const dirtyWork = start !== (lead.workStart ?? "") || end !== (lead.workEnd ?? "");

  return (
    <div className="bg-white rounded-2xl border border-line overflow-hidden">
      <h3 className="font-bold text-sm text-ink-2 px-4 pt-3">ביומן</h3>

      <div className="p-4 flex flex-col gap-2 border-s-4 border-[#16a34a] m-3 mt-2 rounded-xl bg-[#f0fdf4]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#166534]">פגישה</span>
          <span className="text-xs text-[#166534]/70">לקוח שעוד אין איתו חוזה</span>
          {lead.meetingAt && !dirtyMeeting && (
            <span className="ms-auto text-sm font-bold text-[#166534]">
              {sayDay(lead.meetingAt.slice(0, 10))} {lead.meetingAt.slice(11, 16)}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            data-id="schedule-meeting"
            type="datetime-local"
            value={meeting}
            onChange={(e) => setMeeting(e.target.value)}
            className="flex-1 min-w-0 rounded-lg border border-[#bbf7d0] bg-white px-3 py-2 outline-none focus:border-[#16a34a]"
          />
          {dirtyMeeting ? (
            <button
              data-id="schedule-meeting-save"
              disabled={busy}
              onClick={() => onSave({ meetingAt: meeting || null })}
              className="rounded-lg px-4 bg-[#16a34a] text-white font-semibold hover:bg-[#15803d] cursor-pointer disabled:opacity-50"
            >
              שמור
            </button>
          ) : (
            lead.meetingAt && (
              <button
                data-id="schedule-meeting-clear"
                disabled={busy}
                onClick={async () => (await onSave({ meetingAt: null })) && setMeeting("")}
                className="rounded-lg px-3 text-sm text-muted hover:text-ink hover:bg-white cursor-pointer"
              >
                הסר
              </button>
            )
          )}
        </div>
      </div>

      <div className="p-4 flex flex-col gap-2 border-s-4 border-[#dc2626] m-3 rounded-xl bg-[#fef2f2]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#991b1b]">ימי עבודה</span>
          <span className="text-xs text-[#991b1b]/70">נסגר חוזה</span>
          {lead.workStart && !dirtyWork && (
            <span className="ms-auto text-sm font-bold text-[#991b1b]">
              {sayDay(lead.workStart)}
              {lead.workEnd && lead.workEnd !== lead.workStart ? ` – ${sayDay(lead.workEnd)}` : ""}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted">
            מתחיל
            <input
              data-id="schedule-work-start"
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (!end || end < e.target.value) setEnd(e.target.value);
              }}
              className="mt-1 w-full rounded-lg border border-[#fecaca] bg-white px-3 py-2 text-base text-ink outline-none focus:border-[#dc2626]"
            />
          </label>
          <label className="text-xs text-muted">
            מסתיים
            <input
              data-id="schedule-work-end"
              type="date"
              value={end}
              min={start || undefined}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#fecaca] bg-white px-3 py-2 text-base text-ink outline-none focus:border-[#dc2626]"
            />
          </label>
        </div>
        {dirtyWork ? (
          <button
            data-id="schedule-work-save"
            disabled={busy || !start}
            onClick={() => onSave({ workStart: start || null, workEnd: end || start || null })}
            className="rounded-lg py-2 bg-[#dc2626] text-white font-semibold hover:bg-[#b91c1c] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            שמור ימי עבודה
          </button>
        ) : (
          lead.workStart && (
            <button
              data-id="schedule-work-clear"
              disabled={busy}
              onClick={async () => {
                if (await onSave({ workStart: null, workEnd: null })) {
                  setStart("");
                  setEnd("");
                }
              }}
              className="self-start rounded-lg px-3 py-1 text-sm text-muted hover:text-ink hover:bg-white cursor-pointer"
            >
              הסר מהיומן
            </button>
          )
        )}
      </div>
    </div>
  );
}
