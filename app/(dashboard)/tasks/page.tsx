import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { listMyTasks } from "@/lib/modules/checklists/service";
import { toDateOnly } from "@/lib/modules/leave/calendar";
import { TaskCheckbox } from "@/app/(dashboard)/tasks/task-checkbox";
import { Badge, Card, CardHeader, EmptyState, PageHeader, formatDate, humanise } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const actor = await requireActor();
  const tasks = await listMyTasks(actor);
  const today = toDateOnly(new Date());

  return (
    <>
      <PageHeader
        title="My tasks"
        description="Onboarding and offboarding steps waiting on you."
      />

      <Card>
        <CardHeader title="Outstanding" description={tasks.length === 1 ? "1 task" : `${tasks.length} tasks`} />
        {tasks.length === 0 ? (
          <EmptyState title="Nothing outstanding" hint="Steps assigned to you will appear here." />
        ) : (
          <ul className="divide-y divide-[--color-line]">
            {tasks.map((task) => {
              const overdue = task.dueDate < today;
              return (
                <li key={task.id} className="flex items-start gap-3 px-5 py-3.5">
                  <TaskCheckbox id={task.id} label={task.title} />

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{task.title}</span>
                    {task.description ? (
                      <span className="block text-xs text-[--color-muted]">{task.description}</span>
                    ) : null}
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[--color-muted]">
                      <Badge tone={task.kind === "ONBOARDING" ? "brand" : "neutral"}>{humanise(task.kind)}</Badge>
                      <Link href={`/people/${task.subject.id}`} className="text-[--color-brand] hover:underline">
                        {task.subject.firstName} {task.subject.lastName}
                      </Link>
                      <span>· {task.checklistName}</span>
                    </span>
                  </span>

                  <span className={`shrink-0 text-xs ${overdue ? "font-medium text-[--color-danger]" : "text-[--color-muted]"}`}>
                    {overdue ? "Overdue " : "Due "}
                    {formatDate(task.dueDate)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
