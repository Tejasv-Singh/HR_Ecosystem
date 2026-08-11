import { json, parseJsonBody, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { taskCompletionSchema } from "@/lib/modules/checklists/schemas";
import { setTaskCompletion } from "@/lib/modules/checklists/service";

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, { params }: Context) => {
  const actor = await requireActor();
  const { id } = await params;
  const { completed } = await parseJsonBody(request, taskCompletionSchema);
  return json(await setTaskCompletion(actor, id, completed));
});
