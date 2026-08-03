import { z } from "zod";
import { json, parseJsonBody, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { employeeStatusValues } from "@/lib/modules/people/schemas";
import { setEmployeeStatus } from "@/lib/modules/people/service";
import { optionalDate } from "@/lib/validation/common";

const schema = z.object({
  status: z.enum(employeeStatusValues),
  endDate: optionalDate,
});

export const POST = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor();
  const { id } = await params;
  const { status, endDate } = await parseJsonBody(request, schema);
  return json(await setEmployeeStatus(actor, id, status, endDate));
});
