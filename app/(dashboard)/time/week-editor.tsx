"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Play, Square, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/client";
import type { WeekView } from "@/lib/modules/time/service";
import { Alert, Badge, Button, Input } from "@/components/ui";

/** Mirrors formatMinutes on the server; kept local so this stays a client island. */
function hm(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const absolute = Math.abs(Math.round(minutes));
  const hours = Math.floor(absolute / 60);
  const rest = absolute % 60;
  if (hours === 0) return `${sign}${rest}m`;
  if (rest === 0) return `${sign}${hours}h`;
  return `${sign}${hours}h ${rest}m`;
}

const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function WeekEditor({ view }: { view: WeekView }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [note, setNote] = useState("");

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const addEntry = (date: string) =>
    run(async () => {
      await apiFetch("/api/time/entries", {
        method: "POST",
        body: JSON.stringify({ workDate: date, startTime: start, endTime: end, note }),
      });
      setOpenDay(null);
      setNote("");
    });

  return (
    <div>
      {error ? (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-b border-[--color-line] px-5 py-3">
        {view.runningEntryId ? (
          <Button variant="danger" disabled={busy} onClick={() => run(() => apiFetch("/api/time/clock", { method: "DELETE" }))}>
            <Square size={14} /> Clock out
          </Button>
        ) : (
          <Button
            disabled={busy || !view.editable}
            onClick={() => run(() => apiFetch("/api/time/clock", { method: "POST", body: JSON.stringify({}) }))}
          >
            <Play size={14} /> Clock in
          </Button>
        )}
        {view.runningEntryId ? <span className="text-sm text-[--color-muted]">Clock is running.</span> : null}

        <span className="ml-auto">
          {view.status === "OPEN" || view.status === "REJECTED" ? (
            <Button
              variant="primary"
              disabled={busy || view.totalMinutes === 0}
              onClick={() =>
                run(() =>
                  apiFetch("/api/time/timesheets", { method: "POST", body: JSON.stringify({ week: view.weekStart }) }),
                )
              }
            >
              Submit week
            </Button>
          ) : null}
        </span>
      </div>

      <ul className="divide-y divide-[--color-line]">
        {view.days.map((day, index) => {
          const dayLabel = WEEKDAY[index];
          const nonWorking = !day.isWorkingDay;
          return (
            <li key={day.date} className={nonWorking ? "bg-[--color-canvas]" : undefined}>
              <div className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="w-28 shrink-0">
                  <span className="text-sm font-medium">{dayLabel}</span>{" "}
                  <span className="text-xs text-[--color-muted]">{day.date.slice(8)}/{day.date.slice(5, 7)}</span>
                </span>

                <span className="flex flex-1 flex-wrap items-center gap-2">
                  {day.holidayName ? <Badge tone="brand">{day.holidayName}</Badge> : null}
                  {day.leaveTypeName ? (
                    <Badge tone="warn">
                      {day.leaveTypeName}
                      {day.leaveDays === 0.5 ? " (½ day)" : ""}
                    </Badge>
                  ) : null}

                  {day.entries.map((entry) => (
                    <span
                      key={entry.id}
                      className="inline-flex items-center gap-2 rounded-lg border border-[--color-line] px-2.5 py-1 text-sm"
                    >
                      <span className="tabular-nums">
                        {entry.startTime}–{entry.endTime ?? "…"}
                      </span>
                      <span className="text-[--color-muted]">{entry.running ? "running" : hm(entry.minutes)}</span>
                      {entry.note ? <span className="text-xs text-[--color-muted]">{entry.note}</span> : null}
                      {view.editable && !entry.running ? (
                        <button
                          type="button"
                          aria-label={`Remove entry ${entry.startTime}`}
                          className="text-[--color-muted] hover:text-[--color-danger]"
                          onClick={() => run(() => apiFetch(`/api/time/entries/${entry.id}`, { method: "DELETE" }))}
                        >
                          <Trash2 size={13} />
                        </button>
                      ) : null}
                    </span>
                  ))}

                  {day.entries.length === 0 && !day.holidayName && !day.leaveTypeName ? (
                    <span className="text-sm text-[--color-muted]">—</span>
                  ) : null}
                </span>

                <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums">
                  {day.minutes > 0 ? hm(day.minutes) : ""}
                </span>

                {view.editable ? (
                  <Button variant="ghost" onClick={() => setOpenDay(openDay === day.date ? null : day.date)}>
                    {openDay === day.date ? "Close" : "Add"}
                  </Button>
                ) : null}
              </div>

              {openDay === day.date ? (
                <div className="flex flex-wrap items-end gap-3 bg-[--color-canvas] px-5 py-3">
                  <label className="text-sm">
                    <span className="mb-1 block font-medium">Start</span>
                    <Input type="time" value={start} onChange={(event) => setStart(event.target.value)} className="w-32" />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium">End</span>
                    <Input type="time" value={end} onChange={(event) => setEnd(event.target.value)} className="w-32" />
                  </label>
                  <label className="flex-1 text-sm">
                    <span className="mb-1 block font-medium">Note</span>
                    <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" />
                  </label>
                  <Button disabled={busy} onClick={() => addEntry(day.date)}>
                    Add entry
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between border-t border-[--color-line] px-5 py-3">
        <span className="text-sm font-medium">Total</span>
        <span className="text-sm font-semibold tabular-nums">{hm(view.totalMinutes)}</span>
      </div>
    </div>
  );
}
