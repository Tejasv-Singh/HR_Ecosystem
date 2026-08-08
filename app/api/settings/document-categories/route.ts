import { json, parseJsonBody, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { documentCategorySchema } from "@/lib/modules/settings/schemas";
import { createDocumentCategory, listDocumentCategoriesForSettings } from "@/lib/modules/settings/service";

export const GET = route(async () => {
  const actor = await requireActor();
  return json(await listDocumentCategoriesForSettings(actor));
});

export const POST = route(async (request: Request) => {
  const actor = await requireActor();
  return json(await createDocumentCategory(actor, await parseJsonBody(request, documentCategorySchema)), 201);
});
