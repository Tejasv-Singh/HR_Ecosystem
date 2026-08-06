/**
 * Documents module — files attached to an employee record.
 *
 * Files never leave the app as public URLs. Downloads are streamed through a
 * route handler that re-checks permissions, so a leaked storage key on its own
 * grants nothing.
 */
import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { recordAudit } from "@/lib/modules/audit/service";
import type { DocumentUploadInput } from "@/lib/modules/documents/schemas";
import { buildDocumentKey, isAllowedMimeType, maxUploadBytes, storage } from "@/lib/modules/documents/storage";
import {
  assertCan,
  assertCanManageDocuments,
  assertCanReadDocuments,
  assertSameTenant,
  isAdmin,
  type Actor,
} from "@/lib/permissions";
import { employeeTargetFor, getDownlineEmployeeIds } from "@/lib/permissions/scope";

const documentSelect = {
  id: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  expiresAt: true,
  createdAt: true,
  uploadedBy: true,
  employeeId: true,
  category: { select: { id: true, name: true } },
  employee: { select: { id: true, firstName: true, lastName: true } },
} as const;

export async function listEmployeeDocuments(actor: Actor, employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, tenantId: true },
  });
  if (!employee) throw new NotFoundError("Employee not found.");
  assertSameTenant(actor, employee.tenantId);

  const target = await employeeTargetFor(actor, employee);
  assertCanReadDocuments(actor, target);

  return prisma.document.findMany({
    where: { tenantId: actor.tenantId, employeeId },
    select: documentSelect,
    orderBy: { createdAt: "desc" },
  });
}

/** `"all"` means the whole tenant; otherwise an explicit id list. */
async function visibleEmployeeIdsFor(actor: Actor): Promise<"all" | string[]> {
  if (isAdmin(actor.role)) return "all";

  const ids = new Set<string>();
  if (actor.employeeId) ids.add(actor.employeeId);
  if (actor.role === "MANAGER") {
    for (const id of await getDownlineEmployeeIds(actor.tenantId, actor.employeeId)) ids.add(id);
  }
  return [...ids];
}

/**
 * Documents with an expiry inside the window, plus everything already expired.
 * Scoped to what the actor may see: HR gets the tenant, a manager gets their
 * downline plus themselves, an employee gets only their own.
 */
export async function listExpiringDocuments(actor: Actor, withinDays: number) {
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + withinDays);

  const visibleEmployeeIds = await visibleEmployeeIdsFor(actor);
  if (visibleEmployeeIds !== "all" && visibleEmployeeIds.length === 0) return [];

  return prisma.document.findMany({
    where: {
      tenantId: actor.tenantId,
      expiresAt: { not: null, lte: horizon },
      ...(visibleEmployeeIds === "all" ? {} : { employeeId: { in: visibleEmployeeIds } }),
    },
    select: documentSelect,
    orderBy: { expiresAt: "asc" },
  });
}

export async function uploadDocument(
  actor: Actor,
  input: DocumentUploadInput,
  file: { name: string; type: string; bytes: Buffer },
) {
  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, tenantId: true, firstName: true, lastName: true },
  });
  if (!employee) throw new NotFoundError("Employee not found.");
  assertSameTenant(actor, employee.tenantId);

  const target = await employeeTargetFor(actor, employee);
  assertCanManageDocuments(actor, target);

  const category = await prisma.documentCategory.findUnique({
    where: { id: input.categoryId },
    select: { id: true, tenantId: true, name: true, requiresExpiry: true },
  });
  if (!category || category.tenantId !== actor.tenantId) throw new ValidationError("That category does not exist.");
  if (category.requiresExpiry && !input.expiresAt) {
    throw new ValidationError(`Documents in "${category.name}" need an expiry date.`);
  }

  if (file.bytes.byteLength === 0) throw new ValidationError("That file is empty.");
  if (file.bytes.byteLength > maxUploadBytes()) {
    throw new ValidationError(`Files must be under ${Math.round(maxUploadBytes() / 1024 / 1024)} MB.`);
  }
  if (!isAllowedMimeType(file.type)) {
    throw new ValidationError(`Files of type "${file.type}" are not accepted.`);
  }

  const key = buildDocumentKey(actor.tenantId, employee.id, file.name);
  const stored = await storage().put(key, file.bytes, file.type);

  try {
    return await prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          tenantId: actor.tenantId,
          employeeId: employee.id,
          categoryId: category.id,
          fileKey: stored.key,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: stored.size,
          expiresAt: input.expiresAt ?? null,
          uploadedBy: actor.userId,
        },
        select: documentSelect,
      });

      await recordAudit(tx, {
        actor,
        action: "CREATE",
        entityType: "Document",
        entityId: document.id,
        summary: `Uploaded "${file.name}" to ${employee.firstName} ${employee.lastName}`,
        changes: { category: category.name, sizeBytes: stored.size },
      });

      return document;
    });
  } catch (error) {
    // Do not leave an orphaned object behind if the row could not be written.
    await storage().delete(stored.key).catch(() => undefined);
    throw error;
  }
}

/** Loads the bytes for a download, after re-checking read access. */
export async function readDocument(actor: Actor, documentId: string) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      tenantId: true,
      fileKey: true,
      fileName: true,
      mimeType: true,
      employee: { select: { id: true, tenantId: true } },
    },
  });
  if (!document) throw new NotFoundError("Document not found.");
  assertSameTenant(actor, document.tenantId);

  const target = await employeeTargetFor(actor, document.employee);
  assertCanReadDocuments(actor, target);

  const bytes = await storage().get(document.fileKey);

  await recordAudit(prisma, {
    actor,
    action: "DOWNLOAD",
    entityType: "Document",
    entityId: document.id,
    summary: `Downloaded "${document.fileName}"`,
  });

  return { bytes, fileName: document.fileName, mimeType: document.mimeType };
}

export async function deleteDocument(actor: Actor, documentId: string) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      tenantId: true,
      fileKey: true,
      fileName: true,
      employeeId: true,
      employee: { select: { id: true, tenantId: true } },
    },
  });
  if (!document) throw new NotFoundError("Document not found.");
  assertSameTenant(actor, document.tenantId);

  const target = await employeeTargetFor(actor, document.employee);
  assertCanManageDocuments(actor, target);

  await prisma.$transaction(async (tx) => {
    await tx.document.delete({ where: { id: documentId } });
    await recordAudit(tx, {
      actor,
      action: "DELETE",
      entityType: "Document",
      entityId: documentId,
      summary: `Deleted "${document.fileName}"`,
    });
  });

  // Storage cleanup happens after the row is gone: a leftover object is
  // recoverable, a row pointing at a deleted object is not.
  await storage().delete(document.fileKey).catch(() => undefined);
}

export async function listDocumentCategories(actor: Actor) {
  assertCan(actor, "directory:read");
  return prisma.documentCategory.findMany({
    where: { tenantId: actor.tenantId, isActive: true },
    select: { id: true, name: true, requiresExpiry: true },
    orderBy: { name: "asc" },
  });
}
