/**
 * Database-backed context for permission decisions.
 *
 * The policy in `./index.ts` is pure; these helpers gather the relational facts
 * it needs. Kept separate so the policy stays testable without a database.
 */
import { cache } from "react";
import { prisma } from "@/lib/db";
import type { Actor, EmployeeTarget } from "@/lib/permissions";

/**
 * Every employee beneath `managerEmployeeId` in the reporting tree, at any
 * depth. A manager sees their whole downline, not just direct reports.
 *
 * Memoised per request: the directory page needs this once and then asks about
 * it for every row.
 */
export const getDownlineEmployeeIds = cache(
  async (tenantId: string, managerEmployeeId: string | null): Promise<Set<string>> => {
    if (!managerEmployeeId) return new Set();

    const rows = await prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE downline AS (
        SELECT e.id
        FROM "Employee" e
        WHERE e."managerId" = ${managerEmployeeId} AND e."tenantId" = ${tenantId}
        UNION
        SELECT child.id
        FROM "Employee" child
        JOIN downline parent ON child."managerId" = parent.id
        WHERE child."tenantId" = ${tenantId}
      )
      SELECT id FROM downline
    `;

    return new Set(rows.map((row) => row.id));
  },
);

/** Build the target context for a single employee. */
export async function employeeTargetFor(
  actor: Actor,
  employee: { id: string; tenantId: string },
): Promise<EmployeeTarget> {
  const isSelf = actor.employeeId === employee.id;
  // Only managers need the (more expensive) downline lookup.
  const isInDownline =
    actor.role === "MANAGER" && !isSelf
      ? (await getDownlineEmployeeIds(actor.tenantId, actor.employeeId)).has(employee.id)
      : false;

  return { id: employee.id, tenantId: employee.tenantId, isSelf, isInDownline };
}

/** Build target contexts for many employees using a single downline query. */
export async function employeeTargetsFor(
  actor: Actor,
  employees: readonly { id: string; tenantId: string }[],
): Promise<Map<string, EmployeeTarget>> {
  const downline =
    actor.role === "MANAGER" ? await getDownlineEmployeeIds(actor.tenantId, actor.employeeId) : new Set<string>();

  return new Map(
    employees.map((employee) => [
      employee.id,
      {
        id: employee.id,
        tenantId: employee.tenantId,
        isSelf: actor.employeeId === employee.id,
        isInDownline: downline.has(employee.id),
      },
    ]),
  );
}
