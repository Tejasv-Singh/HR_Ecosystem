import { json, parseJsonBody, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { emergencyContactSchema } from "@/lib/modules/people/schemas";
import { addEmergencyContact } from "@/lib/modules/people/service";

export const POST = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor();
  const { id } = await params;
  const input = await parseJsonBody(request, emergencyContactSchema);
  return json(await addEmergencyContact(actor, id, input), 201);
});
