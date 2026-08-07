"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";

/**
 * Shared by invite acceptance and password reset — both post a token plus a new
 * password, and differ only in endpoint and wording.
 */
export function SetPasswordForm({
  token,
  endpoint,
  submitLabel,
  redirectTo,
  successMessage,
}: {
  token: string;
  endpoint: string;
  submitLabel: string;
  redirectTo?: string;
  successMessage?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password: form.get("password"),
          confirmPassword: form.get("confirmPassword"),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(firstMessage(body) ?? "Could not set your password.");
        return;
      }

      if (redirectTo) {
        router.push(redirectTo);
        router.refresh();
      } else {
        setDone(true);
      }
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (done && successMessage) {
    return <Alert tone="success">{successMessage}</Alert>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}

      <Field label="New password" htmlFor="password" hint="At least 12 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} autoFocus />
      </Field>

      <Field label="Confirm password" htmlFor="confirmPassword">
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

function firstMessage(body: { error?: string; details?: unknown }): string | undefined {
  const details = body.details as { properties?: Record<string, { errors?: string[] }> } | undefined;
  const fieldError = details?.properties
    ? Object.values(details.properties).flatMap((entry) => entry.errors ?? [])[0]
    : undefined;
  return fieldError ?? body.error;
}
