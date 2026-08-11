"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { Alert, Button, Card, CardHeader, Field, Input } from "@/components/ui";

export function TenantForm({
  tenant,
}: {
  tenant: { name: string; countryCode: string; timezone: string; currency: string; standardWeeklyHours: number };
}) {
  const router = useRouter();
  const [status, setStatus] = useState<{ tone: "success" | "danger"; message: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    try {
      await apiFetch("/api/settings/tenant", {
        method: "PATCH",
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      setStatus({ tone: "success", message: "Organisation settings saved." });
      router.refresh();
    } catch (caught) {
      setStatus({ tone: "danger", message: caught instanceof Error ? caught.message : "Could not save." });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Organisation" description="Defaults used across the platform." />
      <form onSubmit={onSubmit} className="grid gap-4 px-5 py-4 sm:grid-cols-2">
        {status ? (
          <div className="sm:col-span-2">
            <Alert tone={status.tone}>{status.message}</Alert>
          </div>
        ) : null}

        <Field label="Name" htmlFor="name">
          <Input id="name" name="name" defaultValue={tenant.name} required />
        </Field>
        <Field label="Country code" htmlFor="countryCode" hint="Two letters, e.g. GB.">
          <Input id="countryCode" name="countryCode" defaultValue={tenant.countryCode} maxLength={2} required />
        </Field>
        <Field label="Timezone" htmlFor="timezone" hint="IANA name, e.g. Europe/London.">
          <Input id="timezone" name="timezone" defaultValue={tenant.timezone} required />
        </Field>
        <Field label="Currency" htmlFor="currency" hint="Three letters, e.g. GBP.">
          <Input id="currency" name="currency" defaultValue={tenant.currency} maxLength={3} required />
        </Field>
        <Field
          label="Standard weekly hours"
          htmlFor="standardWeeklyHours"
          hint="A full-time week. Timesheet hours beyond this count as overtime."
        >
          <Input
            id="standardWeeklyHours"
            name="standardWeeklyHours"
            type="number"
            min={1}
            max={80}
            step={0.5}
            defaultValue={tenant.standardWeeklyHours}
            required
          />
        </Field>

        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save organisation"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
