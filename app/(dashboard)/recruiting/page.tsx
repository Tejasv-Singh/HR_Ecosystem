import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { listPostings } from "@/lib/modules/recruiting/service";
import { listDepartments } from "@/lib/modules/org/service";
import { listEmploymentTypes } from "@/lib/modules/settings/service";
import { can } from "@/lib/permissions";
import { PostingForm } from "@/app/(dashboard)/recruiting/posting-form";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  humanise,
  type Tone,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export function postingTone(status: string): Tone {
  switch (status) {
    case "OPEN":
      return "success";
    case "ON_HOLD":
      return "warn";
    case "CLOSED":
      return "neutral";
    default:
      return "brand";
  }
}

export default async function RecruitingPage() {
  const actor = await requireActor();
  const canManage = can(actor, "recruiting:manage");

  const [postings, departments, employmentTypes] = await Promise.all([
    listPostings(actor),
    canManage ? listDepartments(actor) : Promise.resolve([]),
    canManage ? listEmploymentTypes(actor) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Recruitment"
        description={canManage ? "Open roles and their pipelines." : "Roles you are the hiring manager for."}
      />

      <div className="space-y-5">
        <Card>
          <CardHeader title="Job postings" />
          {postings.length === 0 ? (
            <EmptyState
              title="No open roles"
              hint={canManage ? "Create one below." : "You are not the hiring manager for any roles yet."}
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Role</Th>
                  <Th>Department</Th>
                  <Th>Hiring manager</Th>
                  <Th className="text-right">In pipeline</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {postings.map((posting) => (
                  <tr key={posting.id}>
                    <Td>
                      <Link href={`/recruiting/${posting.id}`} className="font-medium text-[--color-brand] hover:underline">
                        {posting.title}
                      </Link>
                      {posting.location ? (
                        <span className="block text-xs text-[--color-muted]">{posting.location}</span>
                      ) : null}
                    </Td>
                    <Td className="text-[--color-muted]">{posting.department?.name ?? "—"}</Td>
                    <Td className="text-[--color-muted]">
                      {posting.hiringManager
                        ? `${posting.hiringManager.firstName} ${posting.hiringManager.lastName}`
                        : "—"}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {posting.liveApplications}
                      {posting.totalApplications !== posting.liveApplications ? (
                        <span className="text-[--color-muted]"> / {posting.totalApplications}</span>
                      ) : null}
                    </Td>
                    <Td>
                      <Badge tone={postingTone(posting.status)}>{humanise(posting.status)}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {canManage ? (
          <PostingForm
            departments={departments.map((department) => ({ id: department.id, name: department.name }))}
            employmentTypes={employmentTypes.map((type) => ({ id: type.id, name: type.name }))}
          />
        ) : null}
      </div>
    </>
  );
}
