import { requireActor } from "@/lib/auth/session";
import { addDays, formatMinutes, toDateOnly, weekStartOf } from "@/lib/modules/leave/calendar";
import { getWeek } from "@/lib/modules/time/service";
import { can } from "@/lib/permissions";
import { WeekEditor } from "@/app/(dashboard)/time/week-editor";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, formatDate, humanise, type Tone } from "@/components/ui";

export const dynamic = "force-dynamic";

export function timesheetTone(status: string): Tone {
  switch (status) {
    case "APPROVED":
      return "success";
    case "SUBMITTED":
      return "warn";
    case "REJECTED":
      return "danger";
    default:
      return "neutral";
  }
}

export default async function TimePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const actor = await requireActor();
  const { week } = await searchParams;

  if (!actor.employeeId) {
    return (
      <>
        <PageHeader title="Timesheet" />
        <Card>
          <EmptyState
            title="No employee record"
            hint="Your login is not linked to an employee, so there are no hours to record."
          />
        </Card>
      </>
    );
  }

  const view = await getWeek(actor, actor.employeeId, week);
  const previous = addDays(view.weekStart, -7);
  const next = addDays(view.weekStart, 7);
  const thisWeek = weekStartOf(toDateOnly(new Date()));

  return (
    <>
      <PageHeader
        title="Timesheet"
        description={`Week of ${formatDate(view.weekStart)} – ${formatDate(view.weekEnd)}`}
        action={
          <span className="flex gap-2">
            <ButtonLink variant="secondary" href={`/time?week=${previous}`}>
              ← Previous
            </ButtonLink>
            {view.weekStart !== thisWeek ? (
              <ButtonLink variant="secondary" href="/time">
                This week
              </ButtonLink>
            ) : null}
            <ButtonLink variant="secondary" href={`/time?week=${next}`}>
              Next →
            </ButtonLink>
            {can(actor, "time:manage") || actor.role === "MANAGER" ? (
              <ButtonLink variant="secondary" href="/time/approvals">
                Approvals
              </ButtonLink>
            ) : null}
          </span>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <SummaryTile label="Recorded" value={formatMinutes(view.totalMinutes)} />
        <SummaryTile label="Expected" value={formatMinutes(view.expectedMinutes)} hint="After weekends, holidays and leave" />
        <SummaryTile
          label="Overtime"
          value={formatMinutes(view.overtimeMinutes)}
          tone={view.overtimeMinutes > 0 ? "warn" : undefined}
        />
      </div>

      {view.status !== "OPEN" ? (
        <div className="mb-5">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <span className="flex items-center gap-2 text-sm">
                <Badge tone={timesheetTone(view.status)}>{humanise(view.status)}</Badge>
                {view.decidedBy ? (
                  <span className="text-[--color-muted]">
                    by {view.decidedBy.firstName} {view.decidedBy.lastName}
                  </span>
                ) : null}
              </span>
              {view.decisionNote ? <span className="text-sm text-[--color-muted]">“{view.decisionNote}”</span> : null}
            </div>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Hours"
          description={
            view.editable
              ? "Add entries against each day, then submit the week for approval."
              : "This week is locked. Approved weeks cannot be edited."
          }
        />
        <WeekEditor view={view} />
      </Card>
    </>
  );
}

function SummaryTile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: Tone }) {
  return (
    <Card>
      <div className="px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[--color-muted]">{label}</p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "warn" ? "text-[--color-warn]" : ""}`}>{value}</p>
        {hint ? <p className="mt-0.5 text-xs text-[--color-muted]">{hint}</p> : null}
      </div>
    </Card>
  );
}
