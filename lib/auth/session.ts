import { cache } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UnauthorizedError } from "@/lib/errors";
import type { Actor } from "@/lib/permissions";

/**
 * Resolve the current actor.
 *
 * The JWT carries only the user id. Role, tenant and employee link are read from
 * the database on every request, so revoking a role or disabling an account takes
 * effect immediately instead of waiting for the session to expire.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      tenantId: true,
      employee: { select: { id: true } },
    },
  });

  if (!user || user.status !== "ACTIVE") return null;

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    employeeId: user.employee?.id ?? null,
  };
});

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new UnauthorizedError();
  return actor;
}
