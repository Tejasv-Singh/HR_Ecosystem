import { json, parseJsonBody, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { interviewSchema } from "@/lib/modules/recruiting/schemas";
import { listMyInterviews, scheduleInterview } from "@/lib/modules/recruiting/service";

/** Interviews the caller is on the panel for. */
export const GET = route(async () => {
  const actor = await requireActor();
  return json(await listMyInterviews(actor));
});

export const POST = route(async (request: Request) => {
  const actor = await requireActor();
  const input = await parseJsonBody(request, interviewSchema);
  return json(await scheduleInterview(actor, input), 201);
});
