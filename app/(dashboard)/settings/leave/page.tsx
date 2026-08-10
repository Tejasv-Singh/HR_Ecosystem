import { requireActor } from "@/lib/auth/session";
import { listHolidays, listLeaveTypes } from "@/lib/modules/leave/service";
import { assertCan } from "@/lib/permissions";
import { LeaveTypeManager } from "@/app/(dashboard)/settings/leave/leave-type-manager";
import { HolidayManager } from "@/app/(dashboard)/settings/leave/holiday-manager";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LeaveSettingsPage() {
  const actor = await requireActor();
  assertCan(actor, "leave:configure");

  const year = new Date().getUTCFullYear();
  const [types, holidays] = await Promise.all([listLeaveTypes(actor, true), listHolidays(actor, year)]);

  return (
    <>
      <PageHeader
        title="Leave settings"
        description="Leave types and the public holidays that are excluded from day counts."
      />
      <div className="space-y-5">
        <LeaveTypeManager initial={types} />
        <HolidayManager initial={holidays} year={year} />
      </div>
    </>
  );
}
