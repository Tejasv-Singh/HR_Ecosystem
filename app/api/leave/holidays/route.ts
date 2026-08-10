import { z } from "zod";
import { json, parseJsonBody, parseSearchParams, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { holidaySchema } from "@/lib/modules/leave/schemas";
import { createHoliday, listHolidays } from "@/lib/modules/leave/service";

export const GET = route(async (request: Request) => {
  const actor = await requireActor();
  const { year } = parseSearchParams(request, z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() }));
  return json(await listHolidays(actor, year));
});

export const POST = route(async (request: Request) => {
  const actor = await requireActor();
  const input = await parseJsonBody(request, holidaySchema);
  return json(await createHoliday(actor, input), 201);
});
