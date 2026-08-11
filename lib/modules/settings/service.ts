/**
 * Settings module — tenant profile and the configuration lists that the rest of
 * the app treats as data rather than hardcoded enums (spec §1).
 */
import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { diffChanges, recordAudit } from "@/lib/modules/audit/service";
import type {
  DocumentCategoryInput,
  EmploymentTypeInput,
  TenantProfileInput,
} from "@/lib/modules/settings/schemas";
import { assertCan, assertSameTenant, type Actor } from "@/lib/permissions";

// --- tenant ----------------------------------------------------------------

export async function getTenant(actor: Actor) {
  const tenant = await prisma.tenant.findUnique({ where: { id: actor.tenantId } });
  if (!tenant) throw new NotFoundError("Tenant not found.");
  // Decimal columns cannot cross into a client component, so they leave the
  // service as plain numbers.
  return { ...tenant, standardWeeklyHours: Number(tenant.standardWeeklyHours) };
}

export async function updateTenant(actor: Actor, input: TenantProfileInput) {
  assertCan(actor, "settings:manage");

  const current = await getTenant(actor);
  assertSameTenant(actor, current.id);

  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.update({ where: { id: actor.tenantId }, data: input });
    const changes = diffChanges(current as Record<string, unknown>, input as Record<string, unknown>);
    if (changes) {
      await recordAudit(tx, {
        actor,
        action: "UPDATE",
        entityType: "Tenant",
        entityId: tenant.id,
        summary: "Updated organisation settings",
        changes,
      });
    }
    return tenant;
  });
}

// --- employment types ------------------------------------------------------

export async function listEmploymentTypes(actor: Actor, includeInactive = false) {
  // The active list is form data — anyone filling in an employee record needs it.
  // The full list, including retired types and their usage counts, is settings
  // material and belongs to whoever administers the tenant.
  assertCan(actor, includeInactive ? "settings:manage" : "directory:read");
  return prisma.employmentType.findMany({
    where: { tenantId: actor.tenantId, ...(includeInactive ? {} : { isActive: true }) },
    select: { id: true, name: true, isActive: true, _count: { select: { employees: true } } },
    orderBy: { name: "asc" },
  });
}

export async function createEmploymentType(actor: Actor, input: EmploymentTypeInput) {
  assertCan(actor, "settings:manage");

  const existing = await prisma.employmentType.findUnique({
    where: { tenantId_name: { tenantId: actor.tenantId, name: input.name } },
    select: { id: true },
  });
  if (existing) throw new ConflictError("That employment type already exists.");

  return prisma.$transaction(async (tx) => {
    const employmentType = await tx.employmentType.create({ data: { ...input, tenantId: actor.tenantId } });
    await recordAudit(tx, {
      actor,
      action: "CREATE",
      entityType: "EmploymentType",
      entityId: employmentType.id,
      summary: `Added employment type ${employmentType.name}`,
    });
    return employmentType;
  });
}

export async function deleteEmploymentType(actor: Actor, id: string) {
  assertCan(actor, "settings:manage");

  const current = await prisma.employmentType.findUnique({
    where: { id },
    select: { id: true, tenantId: true, name: true, _count: { select: { employees: true } } },
  });
  if (!current) throw new NotFoundError("Employment type not found.");
  assertSameTenant(actor, current.tenantId);
  if (current._count.employees > 0) {
    throw new ValidationError("That type is in use. Deactivate it instead of deleting it.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.employmentType.delete({ where: { id } });
    await recordAudit(tx, {
      actor,
      action: "DELETE",
      entityType: "EmploymentType",
      entityId: id,
      summary: `Removed employment type ${current.name}`,
    });
  });
}

export async function setEmploymentTypeActive(actor: Actor, id: string, isActive: boolean) {
  assertCan(actor, "settings:manage");

  const current = await prisma.employmentType.findUnique({ where: { id }, select: { id: true, tenantId: true, name: true } });
  if (!current) throw new NotFoundError("Employment type not found.");
  assertSameTenant(actor, current.tenantId);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.employmentType.update({ where: { id }, data: { isActive } });
    await recordAudit(tx, {
      actor,
      action: "UPDATE",
      entityType: "EmploymentType",
      entityId: id,
      summary: `${isActive ? "Activated" : "Deactivated"} employment type ${current.name}`,
    });
    return updated;
  });
}

// --- document categories ---------------------------------------------------

export async function listDocumentCategoriesForSettings(actor: Actor) {
  assertCan(actor, "settings:manage");
  return prisma.documentCategory.findMany({
    where: { tenantId: actor.tenantId },
    select: { id: true, name: true, requiresExpiry: true, isActive: true, _count: { select: { documents: true } } },
    orderBy: { name: "asc" },
  });
}

export async function createDocumentCategory(actor: Actor, input: DocumentCategoryInput) {
  assertCan(actor, "document:manage_categories");

  const existing = await prisma.documentCategory.findUnique({
    where: { tenantId_name: { tenantId: actor.tenantId, name: input.name } },
    select: { id: true },
  });
  if (existing) throw new ConflictError("That document category already exists.");

  return prisma.$transaction(async (tx) => {
    const category = await tx.documentCategory.create({ data: { ...input, tenantId: actor.tenantId } });
    await recordAudit(tx, {
      actor,
      action: "CREATE",
      entityType: "DocumentCategory",
      entityId: category.id,
      summary: `Added document category ${category.name}`,
    });
    return category;
  });
}

export async function deleteDocumentCategory(actor: Actor, id: string) {
  assertCan(actor, "document:manage_categories");

  const current = await prisma.documentCategory.findUnique({
    where: { id },
    select: { id: true, tenantId: true, name: true, _count: { select: { documents: true } } },
  });
  if (!current) throw new NotFoundError("Document category not found.");
  assertSameTenant(actor, current.tenantId);
  if (current._count.documents > 0) {
    throw new ValidationError("That category has documents. Deactivate it instead of deleting it.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.documentCategory.delete({ where: { id } });
    await recordAudit(tx, {
      actor,
      action: "DELETE",
      entityType: "DocumentCategory",
      entityId: id,
      summary: `Removed document category ${current.name}`,
    });
  });
}

export async function setDocumentCategoryActive(actor: Actor, id: string, isActive: boolean) {
  assertCan(actor, "document:manage_categories");

  const current = await prisma.documentCategory.findUnique({ where: { id }, select: { id: true, tenantId: true, name: true } });
  if (!current) throw new NotFoundError("Document category not found.");
  assertSameTenant(actor, current.tenantId);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.documentCategory.update({ where: { id }, data: { isActive } });
    await recordAudit(tx, {
      actor,
      action: "UPDATE",
      entityType: "DocumentCategory",
      entityId: id,
      summary: `${isActive ? "Activated" : "Deactivated"} document category ${current.name}`,
    });
    return updated;
  });
}

// --- people & roles --------------------------------------------------------

export async function listTenantUsers(actor: Actor) {
  assertCan(actor, "settings:manage");
  return prisma.user.findMany({
    where: { tenantId: actor.tenantId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      lastLoginAt: true,
      employee: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { email: "asc" },
  });
}

/**
 * Role changes are the most dangerous mutation in the product, so they get
 * their own guard rail: an admin may not strip their own admin rights and lock
 * the tenant out of its own settings.
 */
export async function setUserRole(actor: Actor, userId: string, role: EmploymentRoleInput) {
  assertCan(actor, "settings:manage");

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, tenantId: true, email: true, role: true },
  });
  if (!current) throw new NotFoundError("User not found.");
  assertSameTenant(actor, current.tenantId);

  if (current.id === actor.userId && role !== "HR_ADMIN" && role !== "SUPER_ADMIN") {
    throw new ValidationError("You cannot remove your own administrator access.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: userId }, data: { role } });
    await recordAudit(tx, {
      actor,
      action: "UPDATE",
      entityType: "User",
      entityId: userId,
      summary: `Changed role of ${current.email}`,
      changes: { role: { from: current.role, to: role } },
    });
    return updated;
  });
}

type EmploymentRoleInput = "SUPER_ADMIN" | "HR_ADMIN" | "MANAGER" | "EMPLOYEE";
