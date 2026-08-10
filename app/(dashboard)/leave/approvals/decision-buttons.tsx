"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { Button } from "@/components/ui";

export function LeaveDecisionButtons({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"APPROVED" | "REJECTED" | null>(null);

  async function decide(decision: "APPROVED" | "REJECTED") {
    // A rejection without a reason is the thing people complain about most.
    const note = decision === "REJECTED" ? window.prompt("Why is this being rejected?") : null;
    if (decision === "REJECTED" && note === null) return;

    setBusy(decision);
    try {
      await apiFetch(`/api/leave/requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ decision, note }),
      });
      router.refresh();
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <span className="inline-flex gap-2">
      <Button variant="secondary" onClick={() => decide("REJECTED")} disabled={busy !== null}>
        {busy === "REJECTED" ? "…" : "Reject"}
      </Button>
      <Button onClick={() => decide("APPROVED")} disabled={busy !== null}>
        {busy === "APPROVED" ? "…" : "Approve"}
      </Button>
    </span>
  );
}
