import { z } from "zod";
import { json, parseJsonBody, parseSearchParams, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { leaveTypeSchema } from "@/lib/modules/leave/schemas";
import { createLeaveType, listLeaveTypes } from "@/lib/modules/leave/service";

export const GET = route(async (request: Request) => {
  const actor = await requireActor();
  const { includeInactive } = parseSearchParams(request, z.object({ includeInactive: z.coerce.boolean().default(false) }));
  return json(await listLeaveTypes(actor, includeInactive));
});

export const POST = route(async (request: Request) => {
  const actor = await requireActor();
  const input = await parseJsonBody(request, leaveTypeSchema);
  return json(await createLeaveType(actor, input), 201);
});
