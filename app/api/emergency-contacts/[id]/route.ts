import { json, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { deleteEmergencyContact } from "@/lib/modules/people/service";

export const DELETE = route(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor();
  const { id } = await params;
  await deleteEmergencyContact(actor, id);
  return json({ ok: true });
});
