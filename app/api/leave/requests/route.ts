import { json, parseJsonBody, parseSearchParams, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { leaveListQuerySchema, leaveRequestSchema } from "@/lib/modules/leave/schemas";
import { createLeaveRequest, listLeaveRequests } from "@/lib/modules/leave/service";

export const GET = route(async (request: Request) => {
  const actor = await requireActor();
  const query = parseSearchParams(request, leaveListQuerySchema);
  return json(await listLeaveRequests(actor, query));
});

export const POST = route(async (request: Request) => {
  const actor = await requireActor();
  const input = await parseJsonBody(request, leaveRequestSchema);
  return json(await createLeaveRequest(actor, input), 201);
});
