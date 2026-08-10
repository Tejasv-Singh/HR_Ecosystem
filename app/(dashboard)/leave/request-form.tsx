"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";

interface TypeOption {
  id: string;
  name: string;
  allowsHalfDay: boolean;
}

export function LeaveRequestForm({ types }: { types: TypeOption[] }) {
  const router = useRouter();
  const [leaveTypeId, setLeaveTypeId] = useState(types[0]?.id ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startHalf, setStartHalf] = useState(false);
  const [endHalf, setEndHalf] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selected = types.find((type) => type.id === leaveTypeId);
  const singleDay = Boolean(startDate) && startDate === endDate;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch("/api/leave/requests", {
        method: "POST",
        body: JSON.stringify({ leaveTypeId, startDate, endDate, startHalf, endHalf, reason }),
      });
      setStartDate("");
      setEndDate("");
      setStartHalf(false);
      setEndHalf(false);
      setReason("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  if (types.length === 0) {
    return <p className="text-sm text-[--color-muted]">No leave types are available. Ask an administrator to add one.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}

      <Field label="Type" htmlFor="leaveTypeId">
        <Select id="leaveTypeId" value={leaveTypeId} onChange={(event) => setLeaveTypeId(event.target.value)}>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="From" htmlFor="startDate">
        <Input
          id="startDate"
          type="date"
          required
          value={startDate}
          onChange={(event) => {
            setStartDate(event.target.value);
            // Most bookings are a single day; save the second click.
            if (!endDate || endDate < event.target.value) setEndDate(event.target.value);
          }}
        />
      </Field>

      <Field label="To" htmlFor="endDate">
        <Input id="endDate" type="date" required min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
      </Field>

      {selected?.allowsHalfDay ? (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={startHalf} onChange={(event) => setStartHalf(event.target.checked)} />
            {singleDay ? "Half day only" : "First day is a half day"}
          </label>
          {!singleDay ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={endHalf} onChange={(event) => setEndHalf(event.target.checked)} />
              Last day is a half day
            </label>
          ) : null}
        </div>
      ) : null}

      <Field label="Reason" hint="Optional. Visible to your manager and HR." htmlFor="reason">
        <Textarea id="reason" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
      </Field>

      <Button type="submit" disabled={saving || !startDate || !endDate} className="w-full">
        {saving ? "Submitting…" : "Submit request"}
      </Button>
    </form>
  );
}
