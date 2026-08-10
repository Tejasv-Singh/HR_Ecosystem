import { z } from "zod";
import { json, parseJsonBody, parseSearchParams, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { ValidationError } from "@/lib/errors";
import { balanceAdjustmentSchema } from "@/lib/modules/leave/schemas";
import { adjustBalance, getBalances } from "@/lib/modules/leave/service";
import { cuidField } from "@/lib/validation/common";

const querySchema = z.object({
  employeeId: cuidField.optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const GET = route(async (request: Request) => {
  const actor = await requireActor();
  const { employeeId, year } = parseSearchParams(request, querySchema);

  const subject = employeeId ?? actor.employeeId;
  if (!subject) throw new ValidationError("Your login is not linked to an employee record.");

  return json(await getBalances(actor, subject, year));
});

/** Manual ledger adjustment — the "add 3 days TOIL" lever. HR only. */
export const POST = route(async (request: Request) => {
  const actor = await requireActor();
  const input = await parseJsonBody(request, balanceAdjustmentSchema);
  return json(await adjustBalance(actor, input), 201);
});
