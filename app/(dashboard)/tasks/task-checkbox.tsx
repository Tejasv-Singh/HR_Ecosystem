"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check } from "lucide-react";
import { apiFetch } from "@/lib/client";

export function TaskCheckbox({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function complete() {
    setBusy(true);
    try {
      await apiFetch(`/api/checklists/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ completed: true }) });
      router.refresh();
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={complete}
      disabled={busy}
      aria-label={`Complete ${label}`}
      className="mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded border border-[--color-line] text-transparent hover:border-[--color-brand] hover:text-[--color-brand] disabled:opacity-50"
    >
      <Check size={12} />
    </button>
  );
}
