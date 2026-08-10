import { requireActor } from "@/lib/auth/session";
import { listLeaveRequests } from "@/lib/modules/leave/service";
import { isAdmin } from "@/lib/permissions";
import { LeaveDecisionButtons } from "@/app/(dashboard)/leave/approvals/decision-buttons";
import { leaveStatusTone } from "@/app/(dashboard)/leave/page";
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

export default async function LeaveApprovalsPage() {
  const actor = await requireActor();

  // "team" resolves to the downline for a manager and to everyone-but-me for an
  // admin — which is exactly "requests I am allowed to decide" in both cases.
  // Using "all" here would list the actor's own requests with buttons that 403.
  const [pending, decided] = await Promise.all([
    listLeaveRequests(actor, { scope: "team", status: "PENDING" }),
    listLeaveRequests(actor, { scope: "team" }),
  ]);

  const history = decided.filter((request) => request.status !== "PENDING").slice(0, 25);

  return (
    <>
      <PageHeader
        title="Leave approvals"
        description={isAdmin(actor.role) ? "Every request across the organisation." : "Requests from people who report to you."}
      />

      <div className="space-y-5">
        <Card>
          <CardHeader title="Awaiting your decision" description={pending.length === 1 ? "1 request" : `${pending.length} requests`} />
          {pending.length === 0 ? (
            <EmptyState title="Nothing to approve" hint="New requests will appear here." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Employee</Th>
                  <Th>Type</Th>
                  <Th>Dates</Th>
                  <Th className="text-right">Days</Th>
                  <Th>Reason</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {pending.map((request) => (
                  <tr key={request.id}>
                    <Td>
                      <span className="flex items-center gap-2.5">
                        <Avatar person={request.employee} size={28} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{displayName(request.employee)}</span>
                          <span className="block truncate text-xs text-[--color-muted]">{request.employee.jobTitle ?? "—"}</span>
                        </span>
                      </span>
                    </Td>
                    <Td>{request.leaveType.name}</Td>
                    <Td className="whitespace-nowrap">
                      {formatDate(request.startDate)}
                      {request.startDate !== request.endDate ? ` – ${formatDate(request.endDate)}` : null}
                    </Td>
                    <Td className="text-right tabular-nums">{request.days}</Td>
                    <Td className="max-w-56 truncate text-[--color-muted]" >{request.reason || "—"}</Td>
                    <Td className="text-right">
                      <LeaveDecisionButtons id={request.id} />
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
                  <Th>Type</Th>
                  <Th>Dates</Th>
                  <Th className="text-right">Days</Th>
                  <Th>Status</Th>
                  <Th>Decided by</Th>
                </tr>
              </thead>
              <tbody>
                {history.map((request) => (
                  <tr key={request.id}>
                    <Td>{displayName(request.employee)}</Td>
                    <Td>{request.leaveType.name}</Td>
                    <Td className="whitespace-nowrap">
                      {formatDate(request.startDate)}
                      {request.startDate !== request.endDate ? ` – ${formatDate(request.endDate)}` : null}
                    </Td>
                    <Td className="text-right tabular-nums">{request.days}</Td>
                    <Td>
                      <Badge tone={leaveStatusTone(request.status)}>{humanise(request.status)}</Badge>
                    </Td>
                    <Td className="text-[--color-muted]">{request.decidedBy ? displayName(request.decidedBy) : "—"}</Td>
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
