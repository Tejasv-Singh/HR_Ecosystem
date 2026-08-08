"use client";

import { useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email") }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? "Could not send the reset link.");
        return;
      }

      setSent(true);
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    // Same message regardless of whether the address exists.
    return <Alert tone="success">If that address belongs to an account, a reset link is on its way.</Alert>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}

      <Field label="Work email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
