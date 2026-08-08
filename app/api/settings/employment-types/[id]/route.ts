import { z } from "zod";
import { json, parseJsonBody, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { deleteEmploymentType, setEmploymentTypeActive } from "@/lib/modules/settings/service";

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, { params }: Context) => {
  const actor = await requireActor();
  const { id } = await params;
  const { isActive } = await parseJsonBody(request, z.object({ isActive: z.boolean() }));
  return json(await setEmploymentTypeActive(actor, id, isActive));
});

export const DELETE = route(async (_request: Request, { params }: Context) => {
  const actor = await requireActor();
  const { id } = await params;
  await deleteEmploymentType(actor, id);
  return json({ ok: true });
});
