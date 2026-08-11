import { json, parseJsonBody, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { applicationSchema } from "@/lib/modules/recruiting/schemas";
import { addApplication } from "@/lib/modules/recruiting/service";

export const POST = route(async (request: Request) => {
  const actor = await requireActor();
  const input = await parseJsonBody(request, applicationSchema);
  return json(await addApplication(actor, input), 201);
});
