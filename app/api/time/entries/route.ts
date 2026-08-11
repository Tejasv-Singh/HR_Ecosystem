import { json, parseJsonBody, parseSearchParams, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { timeEntrySchema, weekQuerySchema } from "@/lib/modules/time/schemas";
import { createTimeEntry, getWeek } from "@/lib/modules/time/service";
import { ValidationError } from "@/lib/errors";

export const GET = route(async (request: Request) => {
  const actor = await requireActor();
  const { employeeId, week } = parseSearchParams(request, weekQuerySchema);
  const subject = employeeId ?? actor.employeeId;
  if (!subject) throw new ValidationError("Your login is not linked to an employee record.");
  return json(await getWeek(actor, subject, week));
});

export const POST = route(async (request: Request) => {
  const actor = await requireActor();
  const input = await parseJsonBody(request, timeEntrySchema);
  return json(await createTimeEntry(actor, input), 201);
});
