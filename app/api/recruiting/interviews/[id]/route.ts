import { json, parseJsonBody, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { interviewOutcomeSchema } from "@/lib/modules/recruiting/schemas";
import { recordInterviewOutcome } from "@/lib/modules/recruiting/service";

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, { params }: Context) => {
  const actor = await requireActor();
  const { id } = await params;
  const input = await parseJsonBody(request, interviewOutcomeSchema);
  return json(await recordInterviewOutcome(actor, id, input));
});
