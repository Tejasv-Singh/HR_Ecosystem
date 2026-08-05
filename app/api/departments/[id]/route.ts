import { json, parseJsonBody, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { departmentUpdateSchema } from "@/lib/modules/org/schemas";
import { deleteDepartment, updateDepartment } from "@/lib/modules/org/service";

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, { params }: Context) => {
  const actor = await requireActor();
  const { id } = await params;
  return json(await updateDepartment(actor, id, await parseJsonBody(request, departmentUpdateSchema)));
});

export const DELETE = route(async (_request: Request, { params }: Context) => {
  const actor = await requireActor();
  const { id } = await params;
  await deleteDepartment(actor, id);
  return json({ ok: true });
});
