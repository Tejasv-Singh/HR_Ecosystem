import { json, parseJsonBody, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { tenantProfileSchema } from "@/lib/modules/settings/schemas";
import { updateTenant } from "@/lib/modules/settings/service";

export const PATCH = route(async (request: Request) => {
  const actor = await requireActor();
  return json(await updateTenant(actor, await parseJsonBody(request, tenantProfileSchema)));
});
