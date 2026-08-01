import { z } from "zod";
import { json, parseJsonBody, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { employeeSelfUpdateSchema, employeeUpdateSchema } from "@/lib/modules/people/schemas";
import { deleteEmployee, getEmployeeProfile, updateEmployee } from "@/lib/modules/people/service";
import { employeeEditLevel, restrictToSelfEditableFields } from "@/lib/permissions";
import { employeeTargetFor } from "@/lib/permissions/scope";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";

type Context = { params: Promise<{ id: string }> };

/**
 * Returns the profile together with the caller's access level. A colleague gets
 * the directory projection; only the person themselves, their management chain,
 * or HR receive the full record.
 */
export const GET = route(async (_request: Request, { params }: Context) => {
  const actor = await requireActor();
  const { id } = await params;
  return json(await getEmployeeProfile(actor, id));
});

export const PATCH = route(async (request: Request, { params }: Context) => {
  const actor = await requireActor();
  const { id } = await params;

  const employee = await prisma.employee.findUnique({ where: { id }, select: { id: true, tenantId: true } });
  if (!employee) throw new NotFoundError("Employee not found.");

  // Validate against what the caller is actually allowed to do.
  //
  // A self-service caller's payload is checked against the allow-list *before*
  // it reaches the schema. Parsing first would quietly drop `jobTitle` and hand
  // back a 200, which reads to the caller as though the change was accepted;
  // `restrictToSelfEditableFields` refuses it with a 403 instead.
  const target = await employeeTargetFor(actor, employee);

  if (employeeEditLevel(actor, target) === "full") {
    return json(await updateEmployee(actor, id, await parseJsonBody(request, employeeUpdateSchema)));
  }

  const submitted = await parseJsonBody(request, z.record(z.string(), z.unknown()));
  const input = employeeSelfUpdateSchema.parse(restrictToSelfEditableFields(submitted));
  return json(await updateEmployee(actor, id, input));
});

export const DELETE = route(async (_request: Request, { params }: Context) => {
  const actor = await requireActor();
  const { id } = await params;
  await deleteEmployee(actor, id);
  return json({ ok: true });
});
