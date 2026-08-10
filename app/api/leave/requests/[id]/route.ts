import { json, parseJsonBody, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { leaveDecisionSchema } from "@/lib/modules/leave/schemas";
import { cancelLeaveRequest, decideLeaveRequest, getLeaveRequest } from "@/lib/modules/leave/service";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, { params }: Context) => {
  const actor = await requireActor();
  const { id } = await params;
  return json(await getLeaveRequest(actor, id));
});

/** Approve or reject. Cancellation is a DELETE, because it is the requester's own act. */
export const PATCH = route(async (request: Request, { params }: Context) => {
  const actor = await requireActor();
  const { id } = await params;
  const input = await parseJsonBody(request, leaveDecisionSchema);
  return json(await decideLeaveRequest(actor, id, input));
});

export const DELETE = route(async (_request: Request, { params }: Context) => {
  const actor = await requireActor();
  const { id } = await params;
  return json(await cancelLeaveRequest(actor, id));
});
