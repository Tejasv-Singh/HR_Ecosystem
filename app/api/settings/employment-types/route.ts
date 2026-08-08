import { json, parseJsonBody, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { employmentTypeSchema } from "@/lib/modules/settings/schemas";
import { createEmploymentType, listEmploymentTypes } from "@/lib/modules/settings/service";

export const GET = route(async () => {
  const actor = await requireActor();
  return json(await listEmploymentTypes(actor, true));
});

export const POST = route(async (request: Request) => {
  const actor = await requireActor();
  return json(await createEmploymentType(actor, await parseJsonBody(request, employmentTypeSchema)), 201);
});
