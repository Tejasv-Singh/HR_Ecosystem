import { route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { exportEmployeeData } from "@/lib/modules/people/service";

/** GDPR-style data export for one person (spec §7). */
export const GET = route(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor();
  const { id } = await params;
  const data = await exportEmployeeData(actor, id);

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="employee-${id}.json"`,
    },
  });
});
