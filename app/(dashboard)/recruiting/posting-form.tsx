"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { Alert, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";

interface Option {
  id: string;
  name: string;
}

export function PostingForm({ departments, employmentTypes }: { departments: Option[]; employmentTypes: Option[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const form = event.currentTarget;
    try {
      await apiFetch("/api/recruiting/postings", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries())),
      });
      form.reset();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="New req" description="Open it when you are ready for candidates; drafts stay hidden from managers." />
      <form onSubmit={submit} className="grid gap-4 px-5 py-4 sm:grid-cols-2">
        {error ? (
          <div className="sm:col-span-2">
            <Alert>{error}</Alert>
          </div>
        ) : null}

        <Field label="Title" htmlFor="title">
          <Input id="title" name="title" placeholder="Senior Software Engineer" required />
        </Field>

        <Field label="Location" htmlFor="location">
          <Input id="location" name="location" placeholder="Remote" />
        </Field>

        <Field label="Department" htmlFor="departmentId">
          <Select id="departmentId" name="departmentId" defaultValue="">
            <option value="">—</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Employment type" htmlFor="employmentTypeId">
          <Select id="employmentTypeId" name="employmentTypeId" defaultValue="">
            <option value="">—</option>
            {employmentTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Openings" htmlFor="openings" hint="The req closes itself once this many are hired.">
          <Input id="openings" name="openings" type="number" min={1} max={100} defaultValue={1} />
        </Field>

        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue="OPEN">
            <option value="DRAFT">Draft</option>
            <option value="OPEN">Open</option>
            <option value="ON_HOLD">On hold</option>
            <option value="CLOSED">Closed</option>
          </Select>
        </Field>

        <div className="sm:col-span-2">
          <Field label="Description" htmlFor="description">
            <Textarea id="description" name="description" rows={4} />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create req"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
