"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
  Table,
  Td,
  Th,
  humanise,
} from "@/components/ui";

interface LeaveTypeRow {
  id: string;
  name: string;
  colour: string;
  isPaid: boolean;
  requiresApproval: boolean;
  allowsHalfDay: boolean;
  allowsNegative: boolean;
  accrualMethod: string;
  annualDays: number;
  isActive: boolean;
}

const ACCRUAL_LABELS: Record<string, string> = {
  NONE: "Manual only",
  ANNUAL_GRANT: "Granted yearly",
  MONTHLY_ACCRUAL: "Accrues monthly",
};

export function LeaveTypeManager({ initial }: { initial: LeaveTypeRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [annualDays, setAnnualDays] = useState("25");
  const [accrualMethod, setAccrualMethod] = useState("ANNUAL_GRANT");
  const [colour, setColour] = useState("#64748b");
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch("/api/leave/types", {
        method: "POST",
        body: JSON.stringify({ name, annualDays, accrualMethod, colour, requiresApproval }),
      });
      setName("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: LeaveTypeRow) {
    if (!window.confirm(`Remove ${row.name}?`)) return;
    try {
      await apiFetch(`/api/leave/types/${row.id}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "Something went wrong.");
    }
  }

  return (
    <Card>
      <CardHeader title="Leave types" description="Entitlement is per employee, per calendar year." />

      {initial.length === 0 ? (
        <EmptyState title="No leave types yet" hint="Add one below to let people start booking." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Entitlement</Th>
              <Th>Accrual</Th>
              <Th>Rules</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {initial.map((row) => (
              <tr key={row.id}>
                <Td>
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: row.colour }} />
                    {row.name}
                    {!row.isActive ? <Badge>Inactive</Badge> : null}
                  </span>
                </Td>
                <Td className="tabular-nums">{row.annualDays} days</Td>
                <Td className="text-[--color-muted]">{ACCRUAL_LABELS[row.accrualMethod] ?? humanise(row.accrualMethod)}</Td>
                <Td>
                  <span className="flex flex-wrap gap-1.5">
                    <Badge tone={row.isPaid ? "success" : "neutral"}>{row.isPaid ? "Paid" : "Unpaid"}</Badge>
                    {row.requiresApproval ? <Badge tone="warn">Needs approval</Badge> : <Badge tone="brand">Auto-approved</Badge>}
                    {row.allowsHalfDay ? <Badge>Half days</Badge> : null}
                    {row.allowsNegative ? <Badge tone="danger">Can go negative</Badge> : null}
                  </span>
                </Td>
                <Td className="text-right">
                  <Button variant="ghost" onClick={() => remove(row)} aria-label={`Remove ${row.name}`}>
                    <Trash2 size={15} />
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <form onSubmit={add} className="grid gap-3 border-t border-[--color-line] p-5 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        {error ? (
          <div className="sm:col-span-5">
            <Alert>{error}</Alert>
          </div>
        ) : null}

        <Field label="Name" htmlFor="leaveTypeName">
          <Input id="leaveTypeName" value={name} onChange={(event) => setName(event.target.value)} placeholder="Annual leave" required />
        </Field>

        <Field label="Days / year" htmlFor="annualDays">
          <Input
            id="annualDays"
            type="number"
            min={0}
            max={400}
            step={0.5}
            value={annualDays}
            onChange={(event) => setAnnualDays(event.target.value)}
            className="w-28"
          />
        </Field>

        <Field label="Accrual" htmlFor="accrualMethod">
          <Select id="accrualMethod" value={accrualMethod} onChange={(event) => setAccrualMethod(event.target.value)} className="w-44">
            {Object.entries(ACCRUAL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Colour" htmlFor="colour">
          <Input id="colour" type="color" value={colour} onChange={(event) => setColour(event.target.value)} className="h-10 w-16 p-1" />
        </Field>

        <div className="flex items-end gap-3">
          <label className="flex items-center gap-2 pb-2.5 text-sm">
            <input type="checkbox" checked={requiresApproval} onChange={(event) => setRequiresApproval(event.target.checked)} />
            Approval
          </label>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? "Adding…" : "Add"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
