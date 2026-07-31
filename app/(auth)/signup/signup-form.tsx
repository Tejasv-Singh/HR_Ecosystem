"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";

export function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());

    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(firstMessage(body) ?? "Could not create the organisation.");
        return;
      }

      router.push("/people");
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}

      <Field label="Organisation name" htmlFor="organizationName">
        <Input id="organizationName" name="organizationName" required autoFocus />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" htmlFor="firstName">
          <Input id="firstName" name="firstName" autoComplete="given-name" required />
        </Field>
        <Field label="Last name" htmlFor="lastName">
          <Input id="lastName" name="lastName" autoComplete="family-name" required />
        </Field>
      </div>

      <Field label="Country code" htmlFor="countryCode" hint="Two letters, e.g. US or GB.">
        <Input id="countryCode" name="countryCode" defaultValue="US" maxLength={2} required />
      </Field>

      <Field label="Work email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>

      <Field label="Password" htmlFor="password" hint="At least 12 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} />
      </Field>

      <Field label="Confirm password" htmlFor="confirmPassword">
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating…" : "Create organisation"}
      </Button>
    </form>
  );
}

/** Surface the first field-level validation message, falling back to the summary. */
function firstMessage(body: { error?: string; details?: unknown }): string | undefined {
  const details = body.details as { properties?: Record<string, { errors?: string[] }> } | undefined;
  const fieldError = details?.properties
    ? Object.values(details.properties).flatMap((entry) => entry.errors ?? [])[0]
    : undefined;
  return fieldError ?? body.error;
}
