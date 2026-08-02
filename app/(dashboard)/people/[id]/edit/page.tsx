import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { EmployeeForm, type EmployeeFormValues } from "@/app/(dashboard)/people/employee-form";
import { listDepartments } from "@/lib/modules/org/service";
import { getEmployeeProfile, listEmployeeOptions } from "@/lib/modules/people/service";
import { listEmploymentTypes } from "@/lib/modules/settings/service";
import { NotFoundError } from "@/lib/errors";
import { assertCanEditEmployee } from "@/lib/permissions";
import { employeeTargetFor } from "@/lib/permissions/scope";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Edit employee · HR Platform" };

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;

  const stub = await prisma.employee.findUnique({ where: { id }, select: { id: true, tenantId: true } });
  if (!stub) notFound();

  // Throws (and renders the error boundary) if the actor may not edit at all.
  const editLevel = assertCanEditEmployee(actor, await employeeTargetFor(actor, stub));

  let profile: Awaited<ReturnType<typeof getEmployeeProfile>>;
  try {
    profile = await getEmployeeProfile(actor, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const [departments, managers, employmentTypes] = await Promise.all([
    listDepartments(actor),
    listEmployeeOptions(actor, id), // an employee cannot be their own manager
    listEmploymentTypes(actor),
  ]);

  const employee = profile.employee as EmployeeFormValues;

  return (
    <>
      <PageHeader
        title={editLevel === "self" ? "Edit your details" : `Edit ${employee.firstName} ${employee.lastName}`}
        description={
          editLevel === "self"
            ? "Job and employment information is maintained by HR."
            : "Changes are recorded in the audit log."
        }
      />
      <EmployeeForm
        mode={editLevel === "full" ? "full" : "self"}
        employee={{ ...employee, id }}
        departments={departments}
        managers={managers}
        employmentTypes={employmentTypes}
      />
    </>
  );
}
