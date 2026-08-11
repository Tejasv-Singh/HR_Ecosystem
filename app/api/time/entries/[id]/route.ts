import { json, parseJsonBody, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { timeEntryUpdateSchema } from "@/lib/modules/time/schemas";
import { deleteTimeEntry, updateTimeEntry } from "@/lib/modules/time/service";

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, { params }: Context) => {
  const actor = await requireActor();
  const { id } = await params;
  const input = await parseJsonBody(request, timeEntryUpdateSchema);
  return json(await updateTimeEntry(actor, id, input));
});

export const DELETE = route(async (_request: Request, { params }: Context) => {
  const actor = await requireActor();
  const { id } = await params;
  await deleteTimeEntry(actor, id);
  return json({ ok: true });
});
