import { json, parseJsonBody, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { templateSchema } from "@/lib/modules/checklists/schemas";
import { createTemplate, listTemplates } from "@/lib/modules/checklists/service";

export const GET = route(async () => {
  const actor = await requireActor();
  return json(await listTemplates(actor));
});

export const POST = route(async (request: Request) => {
  const actor = await requireActor();
  const input = await parseJsonBody(request, templateSchema);
  return json(await createTemplate(actor, input), 201);
});
