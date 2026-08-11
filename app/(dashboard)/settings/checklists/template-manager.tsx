"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Select, humanise } from "@/components/ui";

interface TemplateItem {
  id: string;
  title: string;
  assignee: string;
  dueOffset: number;
}

interface Template {
  id: string;
  name: string;
  kind: string;
  isActive: boolean;
  usageCount: number;
  items: TemplateItem[];
}

interface DraftItem {
  title: string;
  assignee: string;
  dueOffset: string;
}

const EMPTY_ITEM: DraftItem = { title: "", assignee: "HR", dueOffset: "0" };

/** `-3` reads as "3 days before"; the raw number is meaningless in a list. */
function offsetLabel(offset: number): string {
  if (offset === 0) return "on the day";
  if (offset < 0) return `${Math.abs(offset)}d before`;
  return `${offset}d after`;
}

export function TemplateManager({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("ONBOARDING");
  const [items, setItems] = useState<DraftItem[]>([{ ...EMPTY_ITEM }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch("/api/checklists/templates", {
        method: "POST",
        body: JSON.stringify({
          name,
          kind,
          items: items
            .filter((item) => item.title.trim() !== "")
            .map((item) => ({ title: item.title, assignee: item.assignee, dueOffset: Number(item.dueOffset) })),
        }),
      });
      setName("");
      setItems([{ ...EMPTY_ITEM }]);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(template: Template) {
    if (!window.confirm(`Remove ${template.name}? Checklists already assigned are kept.`)) return;
    try {
      await apiFetch(`/api/checklists/templates/${template.id}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "Something went wrong.");
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Templates" />
        {templates.length === 0 ? (
          <EmptyState title="No templates yet" hint="Build one below — a joiner list is the usual first one." />
        ) : (
          <ul className="divide-y divide-[--color-line]">
            {templates.map((template) => (
              <li key={template.id} className="px-5 py-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-medium">{template.name}</span>
                  <Badge tone={template.kind === "ONBOARDING" ? "brand" : "neutral"}>{humanise(template.kind)}</Badge>
                  <span className="text-xs text-[--color-muted]">
                    {template.items.length} steps
                    {template.usageCount > 0 ? ` · used ${template.usageCount}×` : ""}
                  </span>
                  <Button variant="ghost" className="ml-auto" aria-label={`Remove ${template.name}`} onClick={() => remove(template)}>
                    <Trash2 size={15} />
                  </Button>
                </div>
                <ol className="space-y-1 text-sm text-[--color-muted]">
                  {template.items.map((item) => (
                    <li key={item.id} className="flex flex-wrap gap-2">
                      <span className="text-[--color-ink]">{item.title}</span>
                      <span className="text-xs">
                        {humanise(item.assignee)} · {offsetLabel(item.dueOffset)}
                      </span>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="New template" description="Due dates are relative to the start date, or the last day when offboarding." />
        <form onSubmit={create} className="space-y-4 px-5 py-4">
          {error ? <Alert>{error}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="templateName">
              <Input id="templateName" value={name} onChange={(event) => setName(event.target.value)} placeholder="Standard joiner" required />
            </Field>
            <Field label="Kind" htmlFor="templateKind">
              <Select id="templateKind" value={kind} onChange={(event) => setKind(event.target.value)}>
                <option value="ONBOARDING">Onboarding</option>
                <option value="OFFBOARDING">Offboarding</option>
              </Select>
            </Field>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Steps</p>
            {items.map((item, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_10rem_9rem_auto]">
                <Input
                  value={item.title}
                  onChange={(event) => updateItem(index, { title: event.target.value })}
                  placeholder="Order a laptop"
                  aria-label={`Step ${index + 1} title`}
                />
                <Select
                  value={item.assignee}
                  onChange={(event) => updateItem(index, { assignee: event.target.value })}
                  aria-label={`Step ${index + 1} owner`}
                >
                  <option value="HR">HR</option>
                  <option value="MANAGER">Manager</option>
                  <option value="EMPLOYEE">Employee</option>
                </Select>
                <Input
                  type="number"
                  min={-365}
                  max={365}
                  value={item.dueOffset}
                  onChange={(event) => updateItem(index, { dueOffset: event.target.value })}
                  aria-label={`Step ${index + 1} day offset`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Remove step ${index + 1}`}
                  disabled={items.length === 1}
                  onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            ))}
            <Button type="button" variant="secondary" onClick={() => setItems((current) => [...current, { ...EMPTY_ITEM }])}>
              <Plus size={14} /> Add step
            </Button>
          </div>

          <Button type="submit" disabled={busy || !name.trim() || items.every((item) => item.title.trim() === "")}>
            {busy ? "Creating…" : "Create template"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
