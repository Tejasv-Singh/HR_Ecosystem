/**
 * Audit trail (spec §1: "audit everything").
 *
 * `recordAudit` takes a client so callers can pass a transaction handle and get
 * the mutation and its audit entry committed together — an audit log that can
 * silently miss writes is worse than none.
 */
import { prisma } from "@/lib/db";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { assertCan, type Actor } from "@/lib/permissions";

export type DbClient = PrismaClient | Prisma.TransactionClient;

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "INVITE" | "DOWNLOAD" | "PASSWORD_RESET";

export interface AuditInput {
  actor: Pick<Actor, "userId" | "tenantId" | "email">;
  action: AuditAction;
  entityType: string;
  entityId: string;
  summary?: string;
  changes?: Prisma.InputJsonValue;
}

export async function recordAudit(client: DbClient, input: AuditInput): Promise<void> {
  await client.auditLog.create({
    data: {
      tenantId: input.actor.tenantId,
      actorId: input.actor.userId,
      actorEmail: input.actor.email,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      changes: input.changes,
    },
  });
}

/**
 * Field-level before/after for UPDATE entries. Only changed keys are stored, so
 * the log stays readable and does not duplicate the whole record every time.
 */
export function diffChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Prisma.InputJsonValue | undefined {
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  for (const key of Object.keys(after)) {
    const from = normalise(before[key]);
    const to = normalise(after[key]);
    if (to === undefined) continue;
    if (from !== to) changes[key] = { from: from ?? null, to: to ?? null };
  }

  return Object.keys(changes).length > 0 ? (changes as Prisma.InputJsonValue) : undefined;
}

function normalise(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value;
}

export interface AuditQuery {
  entityType?: string;
  action?: string;
  actorId?: string;
  page?: number;
  pageSize?: number;
}

export async function listAuditLogs(actor: Actor, query: AuditQuery = {}) {
  assertCan(actor, "audit:read");

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 50));

  const where = {
    tenantId: actor.tenantId,
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

/** Distinct entity types present in this tenant's log, for the viewer's filter. */
export async function listAuditEntityTypes(actor: Actor): Promise<string[]> {
  assertCan(actor, "audit:read");
  const rows = await prisma.auditLog.findMany({
    where: { tenantId: actor.tenantId },
    distinct: ["entityType"],
    select: { entityType: true },
    orderBy: { entityType: "asc" },
  });
  return rows.map((row) => row.entityType);
}
