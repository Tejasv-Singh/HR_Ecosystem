import { json, parseJsonBody, parseSearchParams, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { employeeCreateSchema, employeeFilterSchema } from "@/lib/modules/people/schemas";
import { createEmployee, listEmployees } from "@/lib/modules/people/service";

export const GET = route(async (request: Request) => {
  const actor = await requireActor();
  const filter = parseSearchParams(request, employeeFilterSchema);
  return json(await listEmployees(actor, filter));
});

export const POST = route(async (request: Request) => {
  const actor = await requireActor();
  const input = await parseJsonBody(request, employeeCreateSchema);
  return json(await createEmployee(actor, input), 201);
});
