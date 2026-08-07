import { json, parseJsonBody, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { inviteCreateSchema } from "@/lib/modules/accounts/schemas";
import { createInvite, listPendingInvites } from "@/lib/modules/accounts/service";

export const GET = route(async () => {
  const actor = await requireActor();
  return json(await listPendingInvites(actor));
});

export const POST = route(async (request: Request) => {
  const actor = await requireActor();
  const { invite, link } = await createInvite(actor, await parseJsonBody(request, inviteCreateSchema));

  // The link is returned so a development environment without email configured
  // can still complete the flow. The raw token is never stored.
  return json({ id: invite.id, email: invite.email, expiresAt: invite.expiresAt, link }, 201);
});
