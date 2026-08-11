import { json, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { deleteTemplate } from "@/lib/modules/checklists/service";

type Context = { params: Promise<{ id: string }> };

export const DELETE = route(async (_request: Request, { params }: Context) => {
  const actor = await requireActor();
  const { id } = await params;
  await deleteTemplate(actor, id);
  return json({ ok: true });
});
