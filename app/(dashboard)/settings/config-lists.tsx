"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Input } from "@/components/ui";

interface EmploymentType {
  id: string;
  name: string;
  isActive: boolean;
  _count: { employees: number };
}

interface DocumentCategory {
  id: string;
  name: string;
  requiresExpiry: boolean;
  isActive: boolean;
  _count: { documents: number };
}

/**
 * Employment types and document categories are tenant data, not enums, so they
 * are editable here (spec §1: config over hardcode).
 */
export function ConfigLists({
  employmentTypes,
  documentCategories,
}: {
  employmentTypes: EmploymentType[];
  documentCategories: DocumentCategory[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ConfigList
        title="Employment types"
        description="Offered when assigning someone's contract type."
        endpoint="/api/settings/employment-types"
        items={employmentTypes.map((type) => ({
          id: type.id,
          name: type.name,
          isActive: type.isActive,
          usage: type._count.employees,
          usageLabel: "in use",
        }))}
      />

      <ConfigList
        title="Document categories"
        description="Used when filing employee documents."
        endpoint="/api/settings/document-categories"
        withExpiryToggle
        items={documentCategories.map((category) => ({
          id: category.id,
          name: category.name,
          isActive: category.isActive,
          usage: category._count.documents,
          usageLabel: "documents",
          requiresExpiry: category.requiresExpiry,
        }))}
      />
    </div>
  );
}

interface ConfigItem {
  id: string;
  name: string;
  isActive: boolean;
  usage: number;
  usageLabel: string;
  requiresExpiry?: boolean;
}

function ConfigList({
  title,
  description,
  endpoint,
  items,
  withExpiryToggle,
}: {
  title: string;
  description: string;
  endpoint: string;
  items: ConfigItem[];
  withExpiryToggle?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [requiresExpiry, setRequiresExpiry] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(withExpiryToggle ? { name, requiresExpiry } : { name }),
      });
      setName("");
      setRequiresExpiry(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add that.");
    } finally {
      setPending(false);
    }
  }

  async function toggle(id: string, isActive: boolean) {
    setError(null);
    try {
      await apiFetch(`${endpoint}/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update that.");
    }
  }

  async function remove(id: string, label: string) {
    if (!window.confirm(`Delete "${label}"?`)) return;
    setError(null);
    try {
      await apiFetch(`${endpoint}/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete that.");
    }
  }

  return (
    <Card>
      <CardHeader title={title} description={description} />

      <form onSubmit={add} className="space-y-3 border-b border-[--color-line] px-5 py-4">
        {error ? <Alert>{error}</Alert> : null}
        <div className="flex gap-2">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Add new…" required aria-label={`New ${title}`} />
          <Button type="submit" disabled={pending || !name.trim()}>
            Add
          </Button>
        </div>
        {withExpiryToggle ? (
          <label className="flex items-center gap-2 text-sm text-[--color-muted]">
            <input type="checkbox" checked={requiresExpiry} onChange={(event) => setRequiresExpiry(event.target.checked)} />
            Require an expiry date for this category
          </label>
        ) : null}
      </form>

      {items.length === 0 ? (
        <EmptyState title="Nothing configured yet" />
      ) : (
        <ul className="divide-y divide-[--color-line]">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
              <span className="flex items-center gap-2">
                <span className={`text-sm ${item.isActive ? "" : "text-[--color-muted] line-through"}`}>{item.name}</span>
                {item.requiresExpiry ? <Badge tone="warn">expiry required</Badge> : null}
                {item.usage > 0 ? (
                  <Badge>
                    {item.usage} {item.usageLabel}
                  </Badge>
                ) : null}
              </span>
              <span className="flex gap-1">
                <Button variant="ghost" onClick={() => toggle(item.id, !item.isActive)}>
                  {item.isActive ? "Deactivate" : "Activate"}
                </Button>
                {item.usage === 0 ? (
                  <Button variant="ghost" onClick={() => remove(item.id, item.name)}>
                    Delete
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
