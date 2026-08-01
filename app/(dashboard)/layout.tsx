import { redirect } from "next/navigation";
import { DashboardNav } from "@/components/dashboard-nav";
import { getActor } from "@/lib/auth/session";
import { getTenant } from "@/lib/modules/settings/service";
import { prisma } from "@/lib/db";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const [tenant, employee] = await Promise.all([
    getTenant(actor),
    actor.employeeId
      ? prisma.employee.findUnique({
          where: { id: actor.employeeId },
          select: { id: true, firstName: true, lastName: true, preferredName: true, jobTitle: true },
        })
      : null,
  ]);

  return (
    <div className="flex min-h-screen">
      <DashboardNav
        role={actor.role}
        tenantName={tenant.name}
        employeeId={actor.employeeId}
        person={employee ?? { firstName: actor.email.charAt(0), lastName: "", preferredName: actor.email }}
        email={actor.email}
      />
      <main className="min-w-0 flex-1 px-6 py-8 lg:px-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
