import { requireActor } from "@/lib/auth/session";
import { listTimesheets } from "@/lib/modules/time/service";
import { isAdmin } from "@/lib/permissions";
import { TimesheetDecisionButtons } from "@/app/(dashboard)/time/approvals/decision-buttons";
import { timesheetTone } from "@/app/(dashboard)/time/page";
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  displayName,
  formatDate,
  humanise,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TimesheetApprovalsPage() {
  const actor = await requireActor();

  const [submitted, all] = await Promise.all([
    listTimesheets(actor, { scope: "team", status: "SUBMITTED" }),
    listTimesheets(actor, { scope: "team" }),
  ]);
  const history = all.filter((sheet) => sheet.status === "APPROVED" || sheet.status === "REJECTED").slice(0, 25);

  return (
    <>
      <PageHeader
        title="Timesheet approvals"
        description={isAdmin(actor.role) ? "Every submitted week across the organisation." : "Weeks submitted by your reports."}
      />

      <div className="space-y-5">
        <Card>
          <CardHeader title="Awaiting your decision" description={submitted.length === 1 ? "1 week" : `${submitted.length} weeks`} />
          {submitted.length === 0 ? (
            <EmptyState title="Nothing to approve" hint="Submitted weeks will appear here." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Employee</Th>
                  <Th>Week</Th>
                  <Th className="text-right">Hours</Th>
                  <Th>Submitted</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {submitted.map((sheet) => (
                  <tr key={sheet.id}>
                    <Td>
                      <span className="flex items-center gap-2.5">
                        <Avatar person={sheet.employee} size={28} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{displayName(sheet.employee)}</span>
                          <span className="block truncate text-xs text-[--color-muted]">{sheet.employee.jobTitle ?? "—"}</span>
                        </span>
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {formatDate(sheet.weekStart)} – {formatDate(sheet.weekEnd)}
                    </Td>
                    <Td className="text-right font-medium tabular-nums">{sheet.hours}</Td>
                    <Td className="whitespace-nowrap text-[--color-muted]">{formatDate(sheet.submittedAt)}</Td>
                    <Td className="text-right">
                      <TimesheetDecisionButtons id={sheet.id} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Recently decided" />
          {history.length === 0 ? (
            <EmptyState title="No decisions yet" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Employee</Th>
                  <Th>Week</Th>
                  <Th className="text-right">Hours</Th>
                  <Th>Status</Th>
                  <Th>Decided by</Th>
                </tr>
              </thead>
              <tbody>
                {history.map((sheet) => (
                  <tr key={sheet.id}>
                    <Td>{displayName(sheet.employee)}</Td>
                    <Td className="whitespace-nowrap">
                      {formatDate(sheet.weekStart)} – {formatDate(sheet.weekEnd)}
                    </Td>
                    <Td className="text-right tabular-nums">{sheet.hours}</Td>
                    <Td>
                      <Badge tone={timesheetTone(sheet.status)}>{humanise(sheet.status)}</Badge>
                    </Td>
                    <Td className="text-[--color-muted]">{sheet.decidedBy ? displayName(sheet.decidedBy) : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
