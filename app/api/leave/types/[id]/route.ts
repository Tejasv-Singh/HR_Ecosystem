import { json, parseJsonBody, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { leaveTypeSchema } from "@/lib/modules/leave/schemas";
import { deleteLeaveType, updateLeaveType } from "@/lib/modules/leave/service";

type Context = { params: Promise<{ id: string }> };

export const PUT = route(async (request: Request, { params }: Context) => {
  const actor = await requireActor();
  const { id } = await params;
  const input = await parseJsonBody(request, leaveTypeSchema);
  return json(await updateLeaveType(actor, id, input));
});

export const DELETE = route(async (_request: Request, { params }: Context) => {
  const actor = await requireActor();
  const { id } = await params;
  await deleteLeaveType(actor, id);
  return json({ ok: true });
});
