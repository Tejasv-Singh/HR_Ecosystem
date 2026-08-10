import { json, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { deleteHoliday } from "@/lib/modules/leave/service";

type Context = { params: Promise<{ id: string }> };

export const DELETE = route(async (_request: Request, { params }: Context) => {
  const actor = await requireActor();
  const { id } = await params;
  await deleteHoliday(actor, id);
  return json({ ok: true });
});
