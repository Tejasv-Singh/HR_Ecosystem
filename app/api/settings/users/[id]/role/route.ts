import { z } from "zod";
import { json, parseJsonBody, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { setUserRole } from "@/lib/modules/settings/service";

const schema = z.object({ role: z.enum(["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"]) });

export const PATCH = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor();
  const { id } = await params;
  const { role } = await parseJsonBody(request, schema);
  const user = await setUserRole(actor, id, role);
  return json({ id: user.id, role: user.role });
});
