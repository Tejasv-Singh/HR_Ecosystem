import { z } from "zod";
import { json, parseJsonBody, parseSearchParams, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { isDateOnly } from "@/lib/modules/leave/calendar";
import { timesheetListQuerySchema } from "@/lib/modules/time/schemas";
import { listTimesheets, submitTimesheet } from "@/lib/modules/time/service";
import { cuidField } from "@/lib/validation/common";

export const GET = route(async (request: Request) => {
  const actor = await requireActor();
  const query = parseSearchParams(request, timesheetListQuerySchema);
  return json(await listTimesheets(actor, query));
});

/** Submit a week for approval. */
export const POST = route(async (request: Request) => {
  const actor = await requireActor();
  const { employeeId, week } = await parseJsonBody(
    request,
    z.object({
      employeeId: cuidField.optional(),
      week: z.string().trim().refine(isDateOnly, { message: "Enter a valid date." }),
    }),
  );
  return json(await submitTimesheet(actor, employeeId, week), 201);
});
