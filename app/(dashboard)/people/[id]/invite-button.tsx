"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { Alert, Button, Select } from "@/components/ui";

/** Sends (or re-sends) an invitation so an employee can claim their login. */
export function InviteButton({ employeeId, hasActiveLogin }: { employeeId: string; hasActiveLogin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("EMPLOYEE");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (hasActiveLogin) return null;

  async function send() {
    setError(null);
    setPending(true);
    try {
      await apiFetch("/api/invites", { method: "POST", body: JSON.stringify({ employeeId, role }) });
      setMessage("Invitation sent. The link is valid for seven days.");
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the invitation.");
    } finally {
      setPending(false);
    }
  }

  if (message) return <Alert tone="success">{message}</Alert>;

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Send invite
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error ? <Alert>{error}</Alert> : null}
      <Select value={role} onChange={(event) => setRole(event.target.value)} aria-label="Role" className="w-44">
        <option value="EMPLOYEE">Employee</option>
        <option value="MANAGER">Manager</option>
        <option value="HR_ADMIN">HR administrator</option>
      </Select>
      <Button onClick={send} disabled={pending}>
        {pending ? "Sending…" : "Send"}
      </Button>
      <Button variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}
