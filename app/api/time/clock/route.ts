import { json, parseJsonBody, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { clockInSchema } from "@/lib/modules/time/schemas";
import { clockIn, clockOut, getRunningEntry } from "@/lib/modules/time/service";

/** The open clock, if any. */
export const GET = route(async () => {
  const actor = await requireActor();
  return json(await getRunningEntry(actor));
});

export const POST = route(async (request: Request) => {
  const actor = await requireActor();
  const input = await parseJsonBody(request, clockInSchema);
  return json(await clockIn(actor, input), 201);
});

/** Closing the clock is a delete of the running state, not of the entry. */
export const DELETE = route(async () => {
  const actor = await requireActor();
  return json(await clockOut(actor));
});
