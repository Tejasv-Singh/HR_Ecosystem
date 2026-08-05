/**
 * Org module — departments and the reporting tree.
 *
 * The org chart is derived, not stored: it is `Employee.managerId` read as a
 * forest. Anyone in the tenant may view it (it is directory information); only
 * HR may change department structure.
 */
import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { diffChanges, recordAudit } from "@/lib/modules/audit/service";
import type { DepartmentUpdateInput, DepartmentWriteInput } from "@/lib/modules/org/schemas";
import { assertCan, assertSameTenant, type Actor } from "@/lib/permissions";

export interface DepartmentNode {
  id: string;
  name: string;
  parentId: string | null;
  leadId: string | null;
  lead: { id: string; firstName: string; lastName: string } | null;
  memberCount: number;
  children: DepartmentNode[];
}

export interface OrgChartNode {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  jobTitle: string | null;
  departmentName: string | null;
  status: string;
  reports: OrgChartNode[];
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export async function listDepartments(actor: Actor) {
  assertCan(actor, "directory:read");

  const departments = await prisma.department.findMany({
    where: { tenantId: actor.tenantId },
    select: {
      id: true,
      name: true,
      parentId: true,
      leadId: true,
      lead: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { members: true } },
    },
    orderBy: { name: "asc" },
  });

  return departments.map((department) => ({
    id: department.id,
    name: department.name,
    parentId: department.parentId,
    leadId: department.leadId,
    lead: department.lead,
    memberCount: department._count.members,
  }));
}

/** Departments arranged as a forest for the settings/org UI. */
export async function getDepartmentTree(actor: Actor): Promise<DepartmentNode[]> {
  const flat = await listDepartments(actor);
  const nodes = new Map<string, DepartmentNode>(flat.map((item) => [item.id, { ...item, children: [] }]));

  const roots: DepartmentNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  return roots;
}

/** Walk up from `startId`; used to reject nesting a department inside itself. */
async function departmentAncestry(tenantId: string, startId: string): Promise<Set<string>> {
  const rows = await prisma.department.findMany({
    where: { tenantId },
    select: { id: true, parentId: true },
  });
  const parents = new Map(rows.map((row) => [row.id, row.parentId]));

  const seen = new Set<string>();
  let cursor: string | null | undefined = startId;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    cursor = parents.get(cursor);
  }
  return seen;
}

async function assertDepartmentRefs(tenantId: string, input: DepartmentUpdateInput, departmentId?: string) {
  if (input.parentId) {
    const parent = await prisma.department.findUnique({ where: { id: input.parentId }, select: { tenantId: true } });
    if (parent?.tenantId !== tenantId) throw new ValidationError("That parent department does not exist.");

    if (departmentId) {
      if (input.parentId === departmentId) throw new ValidationError("A department cannot be its own parent.");
      // Nesting under one of its own descendants would create a cycle.
      const ancestorsOfParent = await departmentAncestry(tenantId, input.parentId);
      if (ancestorsOfParent.has(departmentId)) {
        throw new ValidationError("That would nest the department inside one of its own sub-departments.");
      }
    }
  }

  if (input.leadId) {
    const lead = await prisma.employee.findUnique({ where: { id: input.leadId }, select: { tenantId: true } });
    if (lead?.tenantId !== tenantId) throw new ValidationError("That employee does not exist.");
  }
}

export async function createDepartment(actor: Actor, input: DepartmentWriteInput) {
  assertCan(actor, "department:manage");
  await assertDepartmentRefs(actor.tenantId, input);

  const existing = await prisma.department.findUnique({
    where: { tenantId_name: { tenantId: actor.tenantId, name: input.name } },
    select: { id: true },
  });
  if (existing) throw new ConflictError("A department with that name already exists.");

  return prisma.$transaction(async (tx) => {
    const department = await tx.department.create({ data: { ...input, tenantId: actor.tenantId } });
    await recordAudit(tx, {
      actor,
      action: "CREATE",
      entityType: "Department",
      entityId: department.id,
      summary: `Created department ${department.name}`,
    });
    return department;
  });
}

export async function updateDepartment(actor: Actor, departmentId: string, input: DepartmentUpdateInput) {
  assertCan(actor, "department:manage");

  const current = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!current) throw new NotFoundError("Department not found.");
  assertSameTenant(actor, current.tenantId);

  await assertDepartmentRefs(actor.tenantId, input, departmentId);

  if (input.name && input.name !== current.name) {
    const clash = await prisma.department.findUnique({
      where: { tenantId_name: { tenantId: actor.tenantId, name: input.name } },
      select: { id: true },
    });
    if (clash) throw new ConflictError("A department with that name already exists.");
  }

  return prisma.$transaction(async (tx) => {
    const department = await tx.department.update({ where: { id: departmentId }, data: input });
    const changes = diffChanges(current as Record<string, unknown>, input as Record<string, unknown>);
    if (changes) {
      await recordAudit(tx, {
        actor,
        action: "UPDATE",
        entityType: "Department",
        entityId: departmentId,
        summary: `Updated department ${department.name}`,
        changes,
      });
    }
    return department;
  });
}

export async function deleteDepartment(actor: Actor, departmentId: string) {
  assertCan(actor, "department:manage");

  const current = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, tenantId: true, name: true, _count: { select: { members: true, children: true } } },
  });
  if (!current) throw new NotFoundError("Department not found.");
  assertSameTenant(actor, current.tenantId);

  if (current._count.members > 0) {
    throw new ValidationError("Move its employees to another department first.");
  }
  if (current._count.children > 0) {
    throw new ValidationError("Move or delete its sub-departments first.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.department.delete({ where: { id: departmentId } });
    await recordAudit(tx, {
      actor,
      action: "DELETE",
      entityType: "Department",
      entityId: departmentId,
      summary: `Deleted department ${current.name}`,
    });
  });
}

// ---------------------------------------------------------------------------
// Org chart
// ---------------------------------------------------------------------------

/**
 * Build the reporting forest for the tenant.
 *
 * Employees whose manager is missing (or who have none) become roots. A record
 * whose manager chain is broken still shows up as a root rather than vanishing,
 * so the chart can never silently hide people.
 */
export async function getOrgChart(actor: Actor): Promise<OrgChartNode[]> {
  assertCan(actor, "directory:read");

  const employees = await prisma.employee.findMany({
    where: { tenantId: actor.tenantId, status: { not: "TERMINATED" } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      jobTitle: true,
      status: true,
      managerId: true,
      department: { select: { name: true } },
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });

  const nodes = new Map<string, OrgChartNode>(
    employees.map((employee) => [
      employee.id,
      {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        preferredName: employee.preferredName,
        jobTitle: employee.jobTitle,
        departmentName: employee.department?.name ?? null,
        status: employee.status,
        reports: [],
      },
    ]),
  );

  const roots: OrgChartNode[] = [];
  for (const employee of employees) {
    const node = nodes.get(employee.id)!;
    const manager = employee.managerId ? nodes.get(employee.managerId) : undefined;
    if (manager && manager !== node) manager.reports.push(node);
    else roots.push(node);
  }

  return roots;
}
