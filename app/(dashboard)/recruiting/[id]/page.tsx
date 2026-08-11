import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { getPosting } from "@/lib/modules/recruiting/service";
import { listAssignableTemplates } from "@/lib/modules/checklists/service";
import { listEmployees } from "@/lib/modules/people/service";
import { can } from "@/lib/permissions";
import { Pipeline } from "@/app/(dashboard)/recruiting/[id]/pipeline";
import { postingTone } from "@/app/(dashboard)/recruiting/page";
import { Badge, ButtonLink, Card, PageHeader, humanise } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PostingPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;

  let posting: Awaited<ReturnType<typeof getPosting>>;
  try {
    posting = await getPosting(actor, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const canHire = can(actor, "recruiting:manage");
  const [templates, staff] = await Promise.all([
    canHire ? listAssignableTemplates(actor) : Promise.resolve([]),
    listEmployees(actor, { page: 1, pageSize: 200 }),
  ]);

  return (
    <>
      <PageHeader
        title={posting.title}
        description={[posting.department?.name, posting.location, posting.employmentType?.name]
          .filter(Boolean)
          .join(" · ")}
        action={
          <ButtonLink variant="secondary" href="/recruiting">
            ← All roles
          </ButtonLink>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={postingTone(posting.status)}>{humanise(posting.status)}</Badge>
        <span className="text-sm text-[--color-muted]">
          {posting.openings} opening{posting.openings === 1 ? "" : "s"}
        </span>
        {posting.hiringManager ? (
          <span className="text-sm text-[--color-muted]">
            · Hiring manager: {posting.hiringManager.firstName} {posting.hiringManager.lastName}
          </span>
        ) : null}
      </div>

      {posting.description ? (
        <Card className="mb-5">
          <p className="whitespace-pre-wrap px-5 py-4 text-sm text-[--color-muted]">{posting.description}</p>
        </Card>
      ) : null}

      <Pipeline
        postingId={posting.id}
        applications={posting.applications.map((application) => ({
          id: application.id,
          stage: application.stage,
          rejectedReason: application.rejectedReason,
          hiredEmployeeId: application.hiredEmployeeId,
          candidate: {
            id: application.candidate.id,
            name: `${application.candidate.firstName} ${application.candidate.lastName}`,
            email: application.candidate.email,
            source: application.candidate.source,
          },
          interviews: application.interviews.map((interview) => ({
            id: interview.id,
            scheduledAt: interview.scheduledAt,
            stageName: interview.stageName,
            outcome: interview.outcome,
            interviewerName: interview.interviewer
              ? `${interview.interviewer.firstName} ${interview.interviewer.lastName}`
              : null,
          })),
        }))}
        canHire={canHire}
        onboardingTemplates={templates
          .filter((template) => template.kind === "ONBOARDING")
          .map((template) => ({ id: template.id, name: template.name }))}
        interviewers={staff.items.map((person) => ({
          id: person.id,
          name: `${person.firstName} ${person.lastName}`,
        }))}
      />
    </>
  );
}
