import { json, parseJsonBody, parseSearchParams, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { postingListQuerySchema, postingSchema } from "@/lib/modules/recruiting/schemas";
import { createPosting, listPostings } from "@/lib/modules/recruiting/service";

export const GET = route(async (request: Request) => {
  const actor = await requireActor();
  const query = parseSearchParams(request, postingListQuerySchema);
  return json(await listPostings(actor, query));
});

export const POST = route(async (request: Request) => {
  const actor = await requireActor();
  const input = await parseJsonBody(request, postingSchema);
  return json(await createPosting(actor, input), 201);
});
