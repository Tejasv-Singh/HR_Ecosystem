import { requireActor } from "@/lib/auth/session";
import { getDepartmentTree } from "@/lib/modules/org/service";
import { listEmployeeOptions } from "@/lib/modules/people/service";
import { can } from "@/lib/permissions";
import { DepartmentManager } from "@/app/(dashboard)/org/departments/department-manager";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Departments · HR Platform" };

export default async function DepartmentsPage() {
  const actor = await requireActor();
  const [tree, employees] = await Promise.all([getDepartmentTree(actor), listEmployeeOptions(actor)]);

  return (
    <>
      <PageHeader title="Departments" description="Departments can be nested and given a lead." />
      <DepartmentManager tree={tree} employees={employees} canManage={can(actor, "department:manage")} />
    </>
  );
}
