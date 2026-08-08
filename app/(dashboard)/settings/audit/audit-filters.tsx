"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, Select } from "@/components/ui";

export function AuditFilters({ entityTypes, actions }: { entityTypes: string[]; actions: string[] }) {
  const router = useRouter();
  const params = useSearchParams();

  function apply(key: string, value: string) {
    const merged = new URLSearchParams(params.toString());
    if (value) merged.set(key, value);
    else merged.delete(key);
    merged.delete("page");
    router.push(`/settings/audit?${merged.toString()}`);
  }

  const hasFilters = Boolean(params.get("entityType") || params.get("action"));

  return (
    <Card className="p-4">
      <div className="flex flex-wrap gap-3">
        <Select
          aria-label="Entity type"
          className="w-56"
          value={params.get("entityType") ?? ""}
          onChange={(event) => apply("entityType", event.target.value)}
        >
          <option value="">All entity types</option>
          {entityTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Action"
          className="w-56"
          value={params.get("action") ?? ""}
          onChange={(event) => apply("action", event.target.value)}
        >
          <option value="">All actions</option>
          {actions.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </Select>

        {hasFilters ? (
          <Button variant="ghost" onClick={() => router.push("/settings/audit")}>
            Clear filters
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
