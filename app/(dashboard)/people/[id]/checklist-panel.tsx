"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Select, formatDate, humanise } from "@/components/ui";

interface Task {
  id: string;
  title: string;
  description: string | null;
  assignee: string;
  assigneeName: string | null;
  dueDate: string;
  completedAt: string | Date | null;
  completedByName: string | null;
}

interface Checklist {
  id: string;
  name: string;
  kind: string;
  anchorDate: string;
  done: number;
  total: number;
  tasks: Task[];
}

export function ChecklistPanel({
  employeeId,
  checklists,
  templates,
  canManage,
}: {
  employeeId: string;
  checklists: Checklist[];
  templates: { id: string; name: string; kind: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Checklists"
        description="Onboarding and offboarding steps, with who owns each one."
      />

      {error ? (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {checklists.length === 0 ? (
        <EmptyState title="No checklists" hint={canManage ? "Assign one below." : undefined} />
      ) : (
        <ul className="divide-y divide-[--color-line]">
          {checklists.map((checklist) => (
            <li key={checklist.id} className="px-5 py-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-medium">{checklist.name}</span>
                <Badge tone={checklist.kind === "ONBOARDING" ? "brand" : "neutral"}>{humanise(checklist.kind)}</Badge>
                <Badge tone={checklist.done === checklist.total ? "success" : "warn"}>
                  {checklist.done}/{checklist.total} done
                </Badge>
                {canManage ? (
                  <Button
                    variant="ghost"
                    className="ml-auto"
                    aria-label={`Remove ${checklist.name}`}
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Remove the ${checklist.name} checklist?`)) {
                        void run(() => apiFetch(`/api/checklists/${checklist.id}`, { method: "DELETE" }));
                      }
                    }}
                  >
                    <Trash2 size={15} />
                  </Button>
                ) : null}
              </div>

              <ul className="space-y-1.5">
                {checklist.tasks.map((task) => {
                  const done = task.completedAt !== null;
                  return (
                    <li key={task.id} className="flex items-start gap-2.5 text-sm">
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
                        onClick={() =>
                          run(() =>
                            apiFetch(`/api/checklists/tasks/${task.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ completed: !done }),
                            }),
                          )
                        }
                        className={`mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded border ${
                          done
                            ? "border-[--color-success] bg-[--color-success] text-white"
                            : "border-[--color-line] hover:border-[--color-brand]"
                        }`}
                      >
                        {done ? <Check size={12} /> : null}
                      </button>

                      <span className="min-w-0 flex-1">
                        <span className={done ? "text-[--color-muted] line-through" : ""}>{task.title}</span>
                        {task.description ? (
                          <span className="block text-xs text-[--color-muted]">{task.description}</span>
                        ) : null}
                      </span>

                      <span className="shrink-0 text-xs text-[--color-muted]">
                        {task.assigneeName ?? humanise(task.assignee)} · due {formatDate(task.dueDate)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {canManage && templates.length > 0 ? (
        <div className="flex flex-wrap items-end gap-3 border-t border-[--color-line] px-5 py-4">
          <label className="flex-1 text-sm">
            <span className="mb-1 block font-medium">Assign a checklist</span>
            <Select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({humanise(template.kind)})
                </option>
              ))}
            </Select>
          </label>
          <Button
            disabled={busy || !templateId}
            onClick={() =>
              run(() =>
                apiFetch("/api/checklists", { method: "POST", body: JSON.stringify({ employeeId, templateId }) }),
              )
            }
          >
            Assign
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
