import { json, parseJsonBody, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { postingSchema } from "@/lib/modules/recruiting/schemas";
import { deletePosting, getPosting, updatePosting } from "@/lib/modules/recruiting/service";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, { params }: Context) => {
  const actor = await requireActor();
  const { id } = await params;
  return json(await getPosting(actor, id));
});

export const PUT = route(async (request: Request, { params }: Context) => {
  const actor = await requireActor();
  const { id } = await params;
  const input = await parseJsonBody(request, postingSchema);
  return json(await updatePosting(actor, id, input));
});

export const DELETE = route(async (_request: Request, { params }: Context) => {
  const actor = await requireActor();
  const { id } = await params;
  await deletePosting(actor, id);
  return json({ ok: true });
});
