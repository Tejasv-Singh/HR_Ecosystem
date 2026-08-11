import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { getEmployeeProfile } from "@/lib/modules/people/service";
import { listEmployeeDocuments } from "@/lib/modules/documents/service";
import { NotFoundError } from "@/lib/errors";
import { isAdmin } from "@/lib/permissions";
import { EmergencyContacts } from "@/app/(dashboard)/people/[id]/emergency-contacts";
import { EmployeeStatusControl } from "@/app/(dashboard)/people/[id]/status-control";
import { DocumentsPanel } from "@/app/(dashboard)/people/[id]/documents-panel";
import { ChecklistPanel } from "@/app/(dashboard)/people/[id]/checklist-panel";
import { listAssignableTemplates, listChecklistsFor } from "@/lib/modules/checklists/service";
import { InviteButton } from "@/app/(dashboard)/people/[id]/invite-button";
import {
  Alert,
  Avatar,
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  displayName,
  formatDate,
  humanise,
  statusTone,
} from "@/components/ui";

export const metadata = { title: "Employee · HR Platform" };

export default async function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;

  let profile: Awaited<ReturnType<typeof getEmployeeProfile>>;
  try {
    profile = await getEmployeeProfile(actor, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const { employee, level, canEdit } = profile;
  const full = level === "full" ? (employee as FullShape) : null;
  const documents = full ? await listEmployeeDocuments(actor, id) : [];
  const admin = isAdmin(actor.role);
  const [checklists, templates] = full
    ? await Promise.all([listChecklistsFor(actor, id), admin ? listAssignableTemplates(actor) : Promise.resolve([])])
    : [[], []];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar person={employee} size={56} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{displayName(employee)}</h1>
            <p className="mt-0.5 text-sm text-[--color-muted]">
              {employee.jobTitle ?? "No job title"}
              {employee.department ? ` · ${employee.department.name}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(employee.status)}>{humanise(employee.status)}</Badge>
              {full?.user ? (
                <Badge tone={full.user.status === "ACTIVE" ? "brand" : "neutral"}>
                  {full.user.status === "ACTIVE" ? "Has login" : "Invite pending"}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <ButtonLink variant="secondary" href={`/people/${id}/edit`}>
              Edit
            </ButtonLink>
          ) : null}
          {full ? (
            <ButtonLink variant="secondary" href={`/api/employees/${id}/export`} prefetch={false}>
              Export data
            </ButtonLink>
          ) : null}
          {admin && full ? <InviteButton employeeId={id} hasActiveLogin={full.user?.status === "ACTIVE"} /> : null}
        </div>
      </div>

      {level === "directory" ? (
        <Alert tone="neutral">
          You are viewing the directory entry for this colleague. Personal details, documents and employment records are
          visible only to them, their management chain, and HR.
        </Alert>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Job information" />
            <dl className="grid gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-2">
              <Detail label="Job title" value={employee.jobTitle} />
              <Detail label="Department" value={employee.department?.name} />
              <Detail
                label="Manager"
                value={
                  employee.manager ? (
                    <Link href={`/people/${employee.manager.id}`} className="text-[--color-brand] hover:underline">
                      {employee.manager.firstName} {employee.manager.lastName}
                    </Link>
                  ) : null
                }
              />
              <Detail label="Location" value={employee.location} />
              {full ? (
                <>
                  <Detail label="Employment type" value={full.employmentType?.name} />
                  <Detail label="Employee number" value={full.employeeNumber} />
                  <Detail label="Start date" value={formatDate(full.startDate)} />
                  <Detail label="End date" value={full.endDate ? formatDate(full.endDate) : null} />
                </>
              ) : null}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Contact" />
            <dl className="grid gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-2">
              <Detail
                label="Work email"
                value={
                  <a href={`mailto:${employee.workEmail}`} className="text-[--color-brand] hover:underline">
                    {employee.workEmail}
                  </a>
                }
              />
              {full ? (
                <>
                  <Detail label="Personal email" value={full.personalEmail} />
                  <Detail label="Phone" value={full.phone} />
                  <Detail label="Date of birth" value={full.dateOfBirth ? formatDate(full.dateOfBirth) : null} />
                  <Detail label="Address" value={full.address} className="sm:col-span-2" />
                  <Detail label="About" value={full.bio} className="sm:col-span-2" />
                </>
              ) : null}
            </dl>
          </Card>

          {full ? <DocumentsPanel employeeId={id} documents={documents} canManage={admin} /> : null}
          {full ? (
            <ChecklistPanel employeeId={id} checklists={checklists} templates={templates} canManage={admin} />
          ) : null}
        </div>

        <div className="space-y-4">
          {admin ? <EmployeeStatusControl employeeId={id} status={employee.status} /> : null}

          {full ? <EmergencyContacts employeeId={id} contacts={full.emergencyContacts} canEdit={canEdit} /> : null}

          {full && full.reports.length > 0 ? (
            <Card>
              <CardHeader title="Direct reports" description={`${full.reports.length} people`} />
              <ul className="divide-y divide-[--color-line]">
                {full.reports.map((report) => (
                  <li key={report.id}>
                    <Link href={`/people/${report.id}`} className="flex items-center gap-2.5 px-5 py-3 hover:bg-[--color-canvas]">
                      <Avatar person={report} size={30} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {report.firstName} {report.lastName}
                        </span>
                        <span className="block truncate text-xs text-[--color-muted]">{report.jobTitle ?? "—"}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

type FullShape = Awaited<ReturnType<typeof getEmployeeProfile>>["employee"] & {
  employmentType: { name: string } | null;
  employeeNumber: string | null;
  personalEmail: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
  address: string | null;
  bio: string | null;
  startDate: Date | null;
  endDate: Date | null;
  user: { id: string; email: string; role: string; status: string; lastLoginAt: Date | null } | null;
  emergencyContacts: { id: string; name: string; relationship: string | null; phone: string | null; email: string | null }[];
  reports: { id: string; firstName: string; lastName: string; jobTitle: string | null }[];
};

function Detail({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-[--color-muted]">{label}</dt>
      <dd className="mt-1 text-sm whitespace-pre-line">{value || "—"}</dd>
    </div>
  );
}
