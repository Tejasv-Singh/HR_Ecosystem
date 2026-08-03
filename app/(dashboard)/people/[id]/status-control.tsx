"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { employeeStatusValues } from "@/lib/modules/people/schemas";
import { Alert, Button, Card, CardHeader, Field, Input, Select, humanise } from "@/components/ui";

export function EmployeeStatusControl({ employeeId, status }: { employeeId: string; status: string }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const leaving = value === "OFFBOARDING" || value === "TERMINATED";

  async function save() {
    setError(null);
    setPending(true);
    try {
      await apiFetch(`/api/employees/${employeeId}/status`, {
        method: "POST",
        body: JSON.stringify({ status: value, endDate: leaving ? endDate || null : null }),
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the status.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Employment status" description="Terminating an employee also disables their login." />
      <div className="space-y-3 px-5 py-4">
        {error ? <Alert>{error}</Alert> : null}

        <Field label="Status" htmlFor="status">
          <Select id="status" value={value} onChange={(event) => setValue(event.target.value)}>
            {employeeStatusValues.map((option) => (
              <option key={option} value={option}>
                {humanise(option)}
              </option>
            ))}
          </Select>
        </Field>

        {leaving ? (
          <Field label="End date" htmlFor="endDate">
            <Input id="endDate" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </Field>
        ) : null}

        <Button onClick={save} disabled={pending || value === status} className="w-full">
          {pending ? "Saving…" : "Update status"}
        </Button>
      </div>
    </Card>
  );
}
