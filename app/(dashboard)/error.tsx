"use client";

import Link from "next/link";
import { Alert, Card } from "@/components/ui";

/**
 * Service functions throw when a permission check fails. Rather than crashing
 * the shell, render a plain explanation.
 */
export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card className="p-6">
      <h1 className="text-lg font-semibold tracking-tight">You cannot view this page</h1>
      <p className="mt-1 mb-4 text-sm text-[--color-muted]">
        Either you do not have permission, or the record does not exist in your organisation.
      </p>
      <Alert tone="neutral">
        If you believe this is a mistake, ask an HR administrator to check your role.
      </Alert>
      <div className="mt-4 flex gap-3 text-sm">
        <button type="button" onClick={reset} className="text-[--color-brand] hover:underline">
          Try again
        </button>
        <Link href="/people" className="text-[--color-brand] hover:underline">
          Back to the directory
        </Link>
      </div>
    </Card>
  );
}
