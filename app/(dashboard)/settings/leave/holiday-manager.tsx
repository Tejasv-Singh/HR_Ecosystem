"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { Alert, Button, Card, CardHeader, EmptyState, Field, Input, Table, Td, Th, formatDate } from "@/components/ui";

interface HolidayRow {
  id: string;
  name: string;
  date: string;
}

export function HolidayManager({ initial, year }: { initial: HolidayRow[]; year: number }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch("/api/leave/holidays", { method: "POST", body: JSON.stringify({ name, date }) });
      setName("");
      setDate("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: HolidayRow) {
    if (!window.confirm(`Remove ${row.name}?`)) return;
    try {
      await apiFetch(`/api/leave/holidays/${row.id}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "Something went wrong.");
    }
  }

  return (
    <Card>
      <CardHeader
        title="Public holidays"
        description={`${year}. These days are never charged against a leave balance.`}
      />

      {initial.length === 0 ? (
        <EmptyState title={`No holidays set for ${year}`} hint="Leave spanning these dates will be charged in full until you add them." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Name</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {initial.map((row) => (
              <tr key={row.id}>
                <Td className="whitespace-nowrap tabular-nums">{formatDate(row.date)}</Td>
                <Td>{row.name}</Td>
                <Td className="text-right">
                  <Button variant="ghost" onClick={() => remove(row)} aria-label={`Remove ${row.name}`}>
                    <Trash2 size={15} />
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <form onSubmit={add} className="grid gap-3 border-t border-[--color-line] p-5 sm:grid-cols-[auto_1fr_auto] sm:items-end">
        {error ? (
          <div className="sm:col-span-3">
            <Alert>{error}</Alert>
          </div>
        ) : null}

        <Field label="Date" htmlFor="holidayDate">
          <Input id="holidayDate" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </Field>

        <Field label="Name" htmlFor="holidayName">
          <Input id="holidayName" value={name} onChange={(event) => setName(event.target.value)} placeholder="Independence Day" required />
        </Field>

        <Button type="submit" disabled={busy || !name.trim() || !date}>
          {busy ? "Adding…" : "Add"}
        </Button>
      </form>
    </Card>
  );
}
