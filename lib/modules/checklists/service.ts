/**
 * Onboarding & offboarding checklists (Phase 2).
 *
 * Assigning a template *copies* it. The tasks an employee sees are their own
 * rows with their own due dates, so editing the template afterwards never
 * rewrites a list someone is halfway through — and deleting the template leaves
 * their checklist intact.
 */
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { recordAudit } from "@/lib/modules/audit/service";
import { addDays, toDateOnly, toUtcDate, type DateOnly } from "@/lib/modules/leave/calendar";
import type { AssignChecklistInput, TemplateInput } from "@/lib/modules/checklists/schemas";
import {
  assertCan,
  assertCanCompleteTask,
  assertCanReopenTask,
  assertCanViewChecklist,
  assertSameTenant,
  type Actor,
  type ChecklistTaskTarget,
  type TaskAssigneeRole,
} from "@/lib/permissions";
import { employeeTargetFor, getDownlineEmployeeIds } from "@/lib/permissions/scope";

// --- templates -------------------------------------------------------------

export async function listTemplates(actor: Actor) {
  assertCan(actor, "checklist:manage");
  const templates = await prisma.checklistTemplate.findMany({
    where: { tenantId: actor.tenantId },
    include: { items: { orderBy: { position: "asc" } }, _count: { select: { checklists: true } } },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  return templates;
}

/** The active templates of a kind — what the "assign" picker offers. */
export async function listAssignableTemplates(actor: Actor) {
  assertCan(actor, "checklist:manage");
  return prisma.checklistTemplate.findMany({
    where: { tenantId: actor.tenantId, isActive: true },
    select: { id: true, name: true, kind: true },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
}

export async function createTemplate(actor: Actor, input: TemplateInput) {
  assertCan(actor, "checklist:manage");

  const existing = await prisma.checklistTemplate.findUnique({
    where: { tenantId_name: { tenantId: actor.tenantId, name: input.name } },
    select: { id: true },
  });
  if (existing) throw new ConflictError("A template with that name already exists.");

  return prisma.$transaction(async (tx) => {
    const template = await tx.checklistTemplate.create({
      data: {
        tenantId: actor.tenantId,
        name: input.name,
        kind: input.kind,
        isActive: input.isActive,
        items: {
          create: input.items.map((item, position) => ({ ...item, position })),
        },
      },
      include: { items: true },
    });
    await recordAudit(tx, {
      actor,
      action: "CREATE",
      entityType: "ChecklistTemplate",
      entityId: template.id,
      summary: `Added ${template.kind.toLowerCase()} checklist ${template.name}`,
    });
    return template;
  });
}

export async function deleteTemplate(actor: Actor, id: string) {
  assertCan(actor, "checklist:manage");

  const current = await prisma.checklistTemplate.findUnique({
    where: { id },
    select: { id: true, tenantId: true, name: true },
  });
  if (!current) throw new NotFoundError("Template not found.");
  assertSameTenant(actor, current.tenantId);

  await prisma.$transaction(async (tx) => {
    // Checklists already handed out keep working; their templateId just nulls.
    await tx.checklistTemplate.delete({ where: { id } });
    await recordAudit(tx, {
      actor,
      action: "DELETE",
      entityType: "ChecklistTemplate",
      entityId: id,
      summary: `Removed checklist template ${current.name}`,
    });
  });
}

// --- assignment ------------------------------------------------------------

/** Who a template's role-based step lands on for this particular employee. */
async function resolveAssignee(
  tenantId: string,
  assignee: TaskAssigneeRole,
  employee: { id: string; managerId: string | null },
): Promise<string | null> {
  if (assignee === "EMPLOYEE") return employee.id;
  if (assignee === "MANAGER") return employee.managerId;
  // HR tasks stay unresolved: any admin can pick them up.
  return null;
}

export async function assignChecklist(actor: Actor, input: AssignChecklistInput) {
  assertCan(actor, "checklist:manage");

  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, tenantId: true, managerId: true, firstName: true, lastName: true, startDate: true, endDate: true },
  });
  if (!employee) throw new NotFoundError("Employee not found.");
  assertSameTenant(actor, employee.tenantId);

  const template = await prisma.checklistTemplate.findUnique({
    where: { id: input.templateId },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!template) throw new NotFoundError("Template not found.");
  assertSameTenant(actor, template.tenantId);
  if (template.items.length === 0) throw new ValidationError("That template has no steps.");

  // Onboarding hangs off the start date, offboarding off the last day.
  const fallback = template.kind === "ONBOARDING" ? employee.startDate : employee.endDate;
  const anchor: DateOnly | null = input.anchorDate ?? (fallback ? toDateOnly(fallback) : null);
  if (!anchor) {
    throw new ValidationError(
      template.kind === "ONBOARDING"
        ? "Set a start date on the employee, or choose a date for the checklist."
        : "Set a last day on the employee, or choose a date for the checklist.",
    );
  }

  const assigneeId = await Promise.all(
    template.items.map((item) => resolveAssignee(actor.tenantId, item.assignee as TaskAssigneeRole, employee)),
  );

  return prisma.$transaction(async (tx) => {
    const checklist = await tx.employeeChecklist.create({
      data: {
        tenantId: actor.tenantId,
        employeeId: employee.id,
        templateId: template.id,
        name: template.name,
        kind: template.kind,
        anchorDate: toUtcDate(anchor),
        tasks: {
          create: template.items.map((item, index) => ({
            tenantId: actor.tenantId,
            title: item.title,
            description: item.description,
            assignee: item.assignee,
            assigneeId: assigneeId[index],
            dueDate: toUtcDate(addDays(anchor, item.dueOffset)),
            position: item.position,
          })),
        },
      },
      include: { tasks: true },
    });

    await recordAudit(tx, {
      actor,
      action: "CREATE",
      entityType: "EmployeeChecklist",
      entityId: checklist.id,
      summary: `Started ${template.name} for ${employee.firstName} ${employee.lastName}`,
    });

    return checklist;
  });
}

export async function deleteChecklist(actor: Actor, id: string) {
  assertCan(actor, "checklist:manage");
  const current = await prisma.employeeChecklist.findUnique({ where: { id }, select: { id: true, tenantId: true, name: true } });
  if (!current) throw new NotFoundError("Checklist not found.");
  assertSameTenant(actor, current.tenantId);

  await prisma.$transaction(async (tx) => {
    await tx.employeeChecklist.delete({ where: { id } });
    await recordAudit(tx, {
      actor,
      action: "DELETE",
      entityType: "EmployeeChecklist",
      entityId: id,
      summary: `Removed checklist ${current.name}`,
    });
  });
}

// --- reading ---------------------------------------------------------------

const checklistInclude = {
  tasks: {
    orderBy: [{ position: "asc" }] as const,
    include: {
      assigneeEmp: { select: { id: true, firstName: true, lastName: true } },
      completedBy: { select: { firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.EmployeeChecklistInclude;

function serialise(checklist: Prisma.EmployeeChecklistGetPayload<{ include: typeof checklistInclude }>) {
  const done = checklist.tasks.filter((task) => task.completedAt !== null).length;
  return {
    id: checklist.id,
    name: checklist.name,
    kind: checklist.kind,
    anchorDate: toDateOnly(checklist.anchorDate),
    completedAt: checklist.completedAt,
    done,
    total: checklist.tasks.length,
    tasks: checklist.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      assignee: task.assignee,
      assigneeName: task.assigneeEmp ? `${task.assigneeEmp.firstName} ${task.assigneeEmp.lastName}` : null,
      dueDate: toDateOnly(task.dueDate),
      completedAt: task.completedAt,
      completedByName: task.completedBy ? `${task.completedBy.firstName} ${task.completedBy.lastName}` : null,
    })),
  };
}

export async function listChecklistsFor(actor: Actor, employeeId: string) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, tenantId: true } });
  if (!employee) throw new NotFoundError("Employee not found.");
  assertSameTenant(actor, employee.tenantId);
  assertCanViewChecklist(actor, await employeeTargetFor(actor, employee));

  const checklists = await prisma.employeeChecklist.findMany({
    where: { employeeId, tenantId: actor.tenantId },
    include: checklistInclude,
    orderBy: { createdAt: "desc" },
  });
  return checklists.map(serialise);
}

/**
 * Everything waiting on the actor personally, plus — for HR — the unresolved HR
 * tasks nobody owns. This is the "what do I need to do today" list.
 */
export async function listMyTasks(actor: Actor) {
  if (!actor.employeeId && actor.role !== "HR_ADMIN" && actor.role !== "SUPER_ADMIN") return [];

  const isAdminRole = actor.role === "HR_ADMIN" || actor.role === "SUPER_ADMIN";
  const downline = actor.role === "MANAGER" ? await getDownlineEmployeeIds(actor.tenantId, actor.employeeId) : new Set<string>();

  const where: Prisma.ChecklistTaskWhereInput = {
    tenantId: actor.tenantId,
    completedAt: null,
    OR: [
      ...(actor.employeeId ? [{ assigneeId: actor.employeeId }] : []),
      // Unclaimed HR steps.
      ...(isAdminRole ? [{ assignee: "HR" as const, assigneeId: null }] : []),
      // Manager steps with no manager set, for someone in this manager's tree.
      ...(downline.size > 0
        ? [{ assignee: "MANAGER" as const, assigneeId: null, checklist: { employeeId: { in: [...downline] } } }]
        : []),
    ],
  };

  const tasks = await prisma.checklistTask.findMany({
    where,
    include: {
      checklist: { select: { id: true, name: true, kind: true, employee: { select: { id: true, firstName: true, lastName: true } } } },
    },
    orderBy: [{ dueDate: "asc" }],
    take: 100,
  });

  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    dueDate: toDateOnly(task.dueDate),
    assignee: task.assignee,
    checklistName: task.checklist.name,
    kind: task.checklist.kind,
    subject: task.checklist.employee,
  }));
}

// --- completing ------------------------------------------------------------

async function taskTargetFor(actor: Actor, taskId: string) {
  const task = await prisma.checklistTask.findUnique({
    where: { id: taskId },
    include: { checklist: { select: { id: true, employeeId: true, tenantId: true, name: true } } },
  });
  if (!task) throw new NotFoundError("Task not found.");
  assertSameTenant(actor, task.tenantId);

  const subject = await employeeTargetFor(actor, {
    id: task.checklist.employeeId,
    tenantId: task.checklist.tenantId,
  });

  const target: ChecklistTaskTarget = {
    tenantId: task.tenantId,
    subject,
    assignee: task.assignee as TaskAssigneeRole,
    isAssignee: Boolean(actor.employeeId) && task.assigneeId === actor.employeeId,
    completed: task.completedAt !== null,
  };

  return { task, target };
}

export async function setTaskCompletion(actor: Actor, taskId: string, completed: boolean) {
  const { task, target } = await taskTargetFor(actor, taskId);

  if (completed) {
    assertCanCompleteTask(actor, target);
  } else {
    assertCanReopenTask(actor, target);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.checklistTask.update({
      where: { id: taskId },
      data: {
        completedAt: completed ? new Date() : null,
        completedById: completed ? actor.employeeId : null,
      },
    });

    // A checklist closes itself once its last task is ticked.
    const outstanding = await tx.checklistTask.count({
      where: { checklistId: task.checklistId, completedAt: null },
    });
    await tx.employeeChecklist.update({
      where: { id: task.checklistId },
      data: { completedAt: outstanding === 0 ? new Date() : null },
    });

    await recordAudit(tx, {
      actor,
      action: "UPDATE",
      entityType: "ChecklistTask",
      entityId: taskId,
      summary: `${completed ? "Completed" : "Reopened"} “${task.title}” on ${task.checklist.name}`,
    });

    return updated;
  });
}
