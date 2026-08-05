import { json, parseJsonBody, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { departmentWriteSchema } from "@/lib/modules/org/schemas";
import { createDepartment, listDepartments } from "@/lib/modules/org/service";

export const GET = route(async () => {
  const actor = await requireActor();
  return json(await listDepartments(actor));
});

export const POST = route(async (request: Request) => {
  const actor = await requireActor();
  return json(await createDepartment(actor, await parseJsonBody(request, departmentWriteSchema)), 201);
});
