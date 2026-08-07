import { json, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { listDocumentCategories } from "@/lib/modules/documents/service";

export const GET = route(async () => {
  const actor = await requireActor();
  return json(await listDocumentCategories(actor));
});
