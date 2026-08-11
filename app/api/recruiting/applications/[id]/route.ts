import { json, parseJsonBody, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { stageMoveSchema } from "@/lib/modules/recruiting/schemas";
import { moveApplication } from "@/lib/modules/recruiting/service";

type Context = { params: Promise<{ id: string }> };

/** Move through the pipeline. Hiring creates the employee record. */
export const PATCH = route(async (request: Request, { params }: Context) => {
  const actor = await requireActor();
  const { id } = await params;
  const input = await parseJsonBody(request, stageMoveSchema);
  return json(await moveApplication(actor, id, input));
});
