import { requireActor } from "@/lib/auth/session";
import { EmployeeForm } from "@/app/(dashboard)/people/employee-form";
import { listDepartments } from "@/lib/modules/org/service";
import { listEmployeeOptions } from "@/lib/modules/people/service";
import { listEmploymentTypes } from "@/lib/modules/settings/service";
import { assertCan } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Add employee · HR Platform" };

export default async function NewEmployeePage() {
  const actor = await requireActor();
  assertCan(actor, "employee:create");

  const [departments, managers, employmentTypes] = await Promise.all([
    listDepartments(actor),
    listEmployeeOptions(actor),
    listEmploymentTypes(actor),
  ]);

  return (
    <>
      <PageHeader
        title="Add employee"
        description="Create the personnel record. You can send them a login invitation afterwards."
      />
      <EmployeeForm mode="create" departments={departments} managers={managers} employmentTypes={employmentTypes} />
    </>
  );
}
