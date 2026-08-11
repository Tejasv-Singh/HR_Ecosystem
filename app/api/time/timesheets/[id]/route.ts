import { json, parseJsonBody, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { timesheetDecisionSchema } from "@/lib/modules/time/schemas";
import { decideTimesheet } from "@/lib/modules/time/service";

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, { params }: Context) => {
  const actor = await requireActor();
  const { id } = await params;
  const input = await parseJsonBody(request, timesheetDecisionSchema);
  return json(await decideTimesheet(actor, id, input));
});
