import { z } from "zod";
import { json, parseJsonBody, parseSearchParams, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { assignChecklistSchema } from "@/lib/modules/checklists/schemas";
import { assignChecklist, listChecklistsFor, listMyTasks } from "@/lib/modules/checklists/service";
import { cuidField } from "@/lib/validation/common";

export const GET = route(async (request: Request) => {
  const actor = await requireActor();
  const { employeeId } = parseSearchParams(request, z.object({ employeeId: cuidField.optional() }));
  // No employee means "what is waiting on me".
  return json(employeeId ? await listChecklistsFor(actor, employeeId) : await listMyTasks(actor));
});

export const POST = route(async (request: Request) => {
  const actor = await requireActor();
  const input = await parseJsonBody(request, assignChecklistSchema);
  return json(await assignChecklist(actor, input), 201);
});
