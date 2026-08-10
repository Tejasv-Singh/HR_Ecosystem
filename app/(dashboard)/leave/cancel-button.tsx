"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { Button } from "@/components/ui";

export function CancelLeaveButton({ id, label = "Cancel" }: { id: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function cancel() {
    if (!window.confirm("Withdraw this leave request?")) return;
    setBusy(true);
    try {
      await apiFetch(`/api/leave/requests/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="ghost" onClick={cancel} disabled={busy}>
      {busy ? "Cancelling…" : label}
    </Button>
  );
}
