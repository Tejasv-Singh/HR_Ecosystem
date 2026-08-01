/**
 * People module — the employee directory and personnel records.
 *
 * Every exported function takes the `Actor` as its first argument and performs
 * its own permission check. There is no "trusted" path into these functions:
 * route handlers, server components and the seed script all go through the same
 * door.
 */
import { prisma } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { diffChanges, recordAudit } from "@/lib/modules/audit/service";
import type {
  EmergencyContactInput,
  EmployeeCreateInput,
  EmployeeFilter,
  EmployeeSelfUpdateInput,
  EmployeeUpdateInput,
} from "@/lib/modules/people/schemas";
import {
  assertCan,
  assertCanEditEmployee,
  assertCanViewFullEmployee,
  assertSameTenant,
  employeeViewLevel,
  isAdmin,
  restrictToSelfEditableFields,
  type Actor,
} from "@/lib/permissions";
import { employeeTargetFor, getDownlineEmployeeIds } from "@/lib/permissions/scope";

/** Fields the whole company may see. */
const directorySelect = {
  id: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  workEmail: true,
  jobTitle: true,
  location: true,
  status: true,
  tenantId: true,
  departmentId: true,
  managerId: true,
  department: { select: { id: true, name: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
} as const;

const fullSelect = {
  ...directorySelect,
  employeeNumber: true,
  personalEmail: true,
  phone: true,
  dateOfBirth: true,
  address: true,
  bio: true,
  startDate: true,
  endDate: true,
  employmentTypeId: true,
  employmentType: { select: { id: true, name: true } },
  userId: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, email: true, role: true, status: true, lastLoginAt: true } },
  emergencyContacts: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, relationship: true, phone: true, email: true } },
  reports: { select: { id: true, firstName: true, lastName: true, jobTitle: true }, orderBy: { firstName: "asc" } },
} as const;

export type DirectoryEmployee = Awaited<ReturnType<typeof listEmployees>>["items"][number];
export type FullEmployee = NonNullable<Awaited<ReturnType<typeof getEmployeeProfile>>>["employee"];

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listEmployees(actor: Actor, filter: EmployeeFilter) {
  assertCan(actor, "directory:read");

  const search = filter.q?.trim();
  const where = {
    tenantId: actor.tenantId,
    ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.managerId ? { managerId: filter.managerId } : {}),
    ...(filter.location ? { location: { contains: filter.location, mode: "insensitive" as const } } : {}),
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: "insensitive" as const } },
            { lastName: { contains: search, mode: "insensitive" as const } },
            { preferredName: { contains: search, mode: "insensitive" as const } },
            { workEmail: { contains: search, mode: "insensitive" as const } },
            { jobTitle: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      select: directorySelect,
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
    }),
    prisma.employee.count({ where }),
  ]);

  return { items, total, page: filter.page, pageSize: filter.pageSize };
}

/**
 * Load a profile along with the viewer's access level.
 *
 * Returns `level: "directory"` for colleagues the actor may merely look up, and
 * `level: "full"` for themselves, their reports, or anyone when the actor is HR.
 * The projection is chosen *before* the query, so restricted fields are never
 * loaded, let alone serialised.
 */
export async function getEmployeeProfile(actor: Actor, employeeId: string) {
  assertCan(actor, "directory:read");

  const stub = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, tenantId: true },
  });
  if (!stub) throw new NotFoundError("Employee not found.");
  assertSameTenant(actor, stub.tenantId);

  const target = await employeeTargetFor(actor, stub);
  const level = employeeViewLevel(actor, target);
  if (level === "none") throw new ForbiddenError();

  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id: employeeId },
    select: level === "full" ? fullSelect : directorySelect,
  });

  return { employee, level, canEdit: isAdmin(actor.role) || target.isSelf };
}

/** Lightweight options for manager/department pickers. */
export async function listEmployeeOptions(actor: Actor, excludeId?: string) {
  assertCan(actor, "directory:read");
  return prisma.employee.findMany({
    where: {
      tenantId: actor.tenantId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      status: { notIn: ["TERMINATED"] },
    },
    select: { id: true, firstName: true, lastName: true, jobTitle: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
}

export async function listDistinctLocations(actor: Actor): Promise<string[]> {
  assertCan(actor, "directory:read");
  const rows = await prisma.employee.findMany({
    where: { tenantId: actor.tenantId, location: { not: null } },
    distinct: ["location"],
    select: { location: true },
    orderBy: { location: "asc" },
  });
  return rows.map((row) => row.location).filter((value): value is string => Boolean(value));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Referenced records must live in the actor's tenant. Without this a crafted
 * payload could point an employee at another tenant's department or manager.
 */
async function assertReferencesInTenant(
  tenantId: string,
  refs: { departmentId?: string | null; managerId?: string | null; employmentTypeId?: string | null },
) {
  if (refs.departmentId) {
    const department = await prisma.department.findUnique({
      where: { id: refs.departmentId },
      select: { tenantId: true },
    });
    if (department?.tenantId !== tenantId) throw new ValidationError("That department does not exist.");
  }

  if (refs.managerId) {
    const manager = await prisma.employee.findUnique({ where: { id: refs.managerId }, select: { tenantId: true } });
    if (manager?.tenantId !== tenantId) throw new ValidationError("That manager does not exist.");
  }

  if (refs.employmentTypeId) {
    const employmentType = await prisma.employmentType.findUnique({
      where: { id: refs.employmentTypeId },
      select: { tenantId: true },
    });
    if (employmentType?.tenantId !== tenantId) throw new ValidationError("That employment type does not exist.");
  }
}

/**
 * A reporting line must stay a tree. Assigning someone's own subordinate (at any
 * depth) as their manager would create a cycle that makes the org chart
 * infinite, so reject it.
 */
async function assertNoReportingCycle(tenantId: string, employeeId: string, managerId: string | null | undefined) {
  if (!managerId) return;
  if (managerId === employeeId) throw new ValidationError("An employee cannot report to themselves.");

  const downline = await getDownlineEmployeeIds(tenantId, employeeId);
  if (downline.has(managerId)) {
    throw new ValidationError("That person reports to this employee, so they cannot also be their manager.");
  }
}

export async function createEmployee(actor: Actor, input: EmployeeCreateInput) {
  assertCan(actor, "employee:create");
  await assertReferencesInTenant(actor.tenantId, input);

  const existing = await prisma.employee.findUnique({
    where: { tenantId_workEmail: { tenantId: actor.tenantId, workEmail: input.workEmail } },
    select: { id: true },
  });
  if (existing) throw new ConflictError("An employee with that work email already exists.");

  return prisma.$transaction(async (tx) => {
    const employee = await tx.employee.create({
      data: { ...input, tenantId: actor.tenantId },
      select: fullSelect,
    });

    await recordAudit(tx, {
      actor,
      action: "CREATE",
      entityType: "Employee",
      entityId: employee.id,
      summary: `Created employee ${employee.firstName} ${employee.lastName}`,
      changes: { workEmail: employee.workEmail, jobTitle: employee.jobTitle },
    });

    return employee;
  });
}

export async function updateEmployee(
  actor: Actor,
  employeeId: string,
  input: EmployeeUpdateInput | EmployeeSelfUpdateInput,
) {
  const current = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!current) throw new NotFoundError("Employee not found.");
  assertSameTenant(actor, current.tenantId);

  const target = await employeeTargetFor(actor, current);
  const editLevel = assertCanEditEmployee(actor, target);

  // A self-service caller may only ever touch the allow-listed fields, whatever
  // the request body claims.
  const data = editLevel === "self" ? restrictToSelfEditableFields(input as Record<string, unknown>) : input;

  if (editLevel === "full") {
    const refs = data as EmployeeUpdateInput;
    await assertReferencesInTenant(actor.tenantId, refs);
    if ("managerId" in refs) await assertNoReportingCycle(actor.tenantId, employeeId, refs.managerId);

    if (refs.workEmail && refs.workEmail !== current.workEmail) {
      const clash = await prisma.employee.findUnique({
        where: { tenantId_workEmail: { tenantId: actor.tenantId, workEmail: refs.workEmail } },
        select: { id: true },
      });
      if (clash) throw new ConflictError("An employee with that work email already exists.");
    }
  }

  return prisma.$transaction(async (tx) => {
    const employee = await tx.employee.update({
      where: { id: employeeId },
      data: data as EmployeeUpdateInput,
      select: fullSelect,
    });

    const changes = diffChanges(current as Record<string, unknown>, data as Record<string, unknown>);
    if (changes) {
      await recordAudit(tx, {
        actor,
        action: "UPDATE",
        entityType: "Employee",
        entityId: employeeId,
        summary:
          editLevel === "self"
            ? `Updated own profile`
            : `Updated employee ${employee.firstName} ${employee.lastName}`,
        changes,
      });
    }

    return employee;
  });
}

/**
 * Deactivation, not deletion. Setting a terminal status also disables the login
 * so an offboarded employee cannot sign in while their record is retained.
 */
export async function setEmployeeStatus(
  actor: Actor,
  employeeId: string,
  status: EmployeeCreateInput["status"],
  endDate?: Date | null,
) {
  assertCan(actor, "employee:create");

  const current = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, tenantId: true, status: true, userId: true, firstName: true, lastName: true },
  });
  if (!current) throw new NotFoundError("Employee not found.");
  assertSameTenant(actor, current.tenantId);

  return prisma.$transaction(async (tx) => {
    const employee = await tx.employee.update({
      where: { id: employeeId },
      data: { status, ...(endDate !== undefined ? { endDate } : {}) },
      select: fullSelect,
    });

    if (current.userId) {
      await tx.user.update({
        where: { id: current.userId },
        data: { status: status === "TERMINATED" ? "DISABLED" : undefined },
      });
    }

    await recordAudit(tx, {
      actor,
      action: "UPDATE",
      entityType: "Employee",
      entityId: employeeId,
      summary: `Changed status of ${current.firstName} ${current.lastName} to ${status}`,
      changes: { status: { from: current.status, to: status } },
    });

    return employee;
  });
}

/**
 * Hard delete, for correcting mistakes and for GDPR erasure requests (spec §7).
 * Ordinary offboarding should use `setEmployeeStatus` instead.
 */
export async function deleteEmployee(actor: Actor, employeeId: string) {
  assertCan(actor, "employee:delete");

  const current = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, tenantId: true, firstName: true, lastName: true, workEmail: true, userId: true },
  });
  if (!current) throw new NotFoundError("Employee not found.");
  assertSameTenant(actor, current.tenantId);

  if (current.id === actor.employeeId) {
    throw new ValidationError("You cannot delete your own employee record.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.employee.delete({ where: { id: employeeId } });
    if (current.userId) await tx.user.delete({ where: { id: current.userId } });

    await recordAudit(tx, {
      actor,
      action: "DELETE",
      entityType: "Employee",
      entityId: employeeId,
      summary: `Deleted employee ${current.firstName} ${current.lastName}`,
      changes: { workEmail: current.workEmail },
    });
  });
}

/**
 * GDPR-style data export: everything held about one person, as JSON.
 * Available to HR and to the employee themselves.
 */
export async function exportEmployeeData(actor: Actor, employeeId: string) {
  const stub = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, tenantId: true } });
  if (!stub) throw new NotFoundError("Employee not found.");
  assertSameTenant(actor, stub.tenantId);

  const target = await employeeTargetFor(actor, stub);
  assertCanViewFullEmployee(actor, target);

  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id: employeeId },
    include: {
      department: { select: { name: true } },
      employmentType: { select: { name: true } },
      manager: { select: { firstName: true, lastName: true } },
      emergencyContacts: true,
      documents: { select: { id: true, fileName: true, createdAt: true, expiresAt: true, category: { select: { name: true } } } },
      user: { select: { email: true, role: true, status: true, lastLoginAt: true } },
    },
  });

  return { exportedAt: new Date().toISOString(), employee };
}

// ---------------------------------------------------------------------------
// Emergency contacts
// ---------------------------------------------------------------------------

export async function addEmergencyContact(actor: Actor, employeeId: string, input: EmergencyContactInput) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, tenantId: true },
  });
  if (!employee) throw new NotFoundError("Employee not found.");
  assertSameTenant(actor, employee.tenantId);

  const target = await employeeTargetFor(actor, employee);
  assertCanEditEmployee(actor, target); // HR, or the employee on their own record

  return prisma.$transaction(async (tx) => {
    const contact = await tx.emergencyContact.create({
      data: { ...input, employeeId, tenantId: actor.tenantId },
    });

    await recordAudit(tx, {
      actor,
      action: "CREATE",
      entityType: "EmergencyContact",
      entityId: contact.id,
      summary: `Added emergency contact for employee ${employeeId}`,
    });

    return contact;
  });
}

export async function deleteEmergencyContact(actor: Actor, contactId: string) {
  const contact = await prisma.emergencyContact.findUnique({
    where: { id: contactId },
    select: { id: true, tenantId: true, employeeId: true, employee: { select: { id: true, tenantId: true } } },
  });
  if (!contact) throw new NotFoundError("Contact not found.");
  assertSameTenant(actor, contact.tenantId);

  const target = await employeeTargetFor(actor, contact.employee);
  assertCanEditEmployee(actor, target);

  await prisma.$transaction(async (tx) => {
    await tx.emergencyContact.delete({ where: { id: contactId } });
    await recordAudit(tx, {
      actor,
      action: "DELETE",
      entityType: "EmergencyContact",
      entityId: contactId,
      summary: `Removed emergency contact for employee ${contact.employeeId}`,
    });
  });
}
