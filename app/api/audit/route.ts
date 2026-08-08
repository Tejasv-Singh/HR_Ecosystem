import { z } from "zod";
import { json, parseSearchParams, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { listAuditLogs } from "@/lib/modules/audit/service";

const querySchema = z.object({
  entityType: z.string().optional(),
  action: z.string().optional(),
  actorId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const GET = route(async (request: Request) => {
  const actor = await requireActor();
  return json(await listAuditLogs(actor, parseSearchParams(request, querySchema)));
});
