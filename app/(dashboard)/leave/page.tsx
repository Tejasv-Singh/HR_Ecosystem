import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { getBalances, listLeaveRequests, listLeaveTypes } from "@/lib/modules/leave/service";
import { can } from "@/lib/permissions";
import { LeaveRequestForm } from "@/app/(dashboard)/leave/request-form";
import { CancelLeaveButton } from "@/app/(dashboard)/leave/cancel-button";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  formatDate,
  humanise,
  type Tone,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export function leaveStatusTone(status: string): Tone {
  switch (status) {
    case "APPROVED":
      return "success";
    case "PENDING":
      return "warn";
    case "REJECTED":
      return "danger";
    default:
      return "neutral";
  }
}

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const actor = await requireActor();
  const { year: yearParam } = await searchParams;
  const year = Number(yearParam) || new Date().getUTCFullYear();

  // A login with no employee record (a bare admin account) has nothing to book.
  if (!actor.employeeId) {
    return (
      <>
        <PageHeader title="Leave" />
        <Card>
          <EmptyState
            title="No employee record"
            hint="Your login is not linked to an employee, so there is no leave to show. Link it from Settings → People."
          />
        </Card>
      </>
    );
  }

  const [balances, requests, types] = await Promise.all([
    getBalances(actor, actor.employeeId, year),
    listLeaveRequests(actor, { scope: "mine", year }),
    listLeaveTypes(actor),
  ]);

  return (
    <>
      <PageHeader
        title="Leave"
        description={`Your balances and bookings for ${year}.`}
        action={
          can(actor, "leave:manage") ? (
            <ButtonLink href="/leave/approvals" variant="secondary">
              Approvals
            </ButtonLink>
          ) : null
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Balances" description={`Remaining is entitlement less booked and pending days.`} />
            {balances.length === 0 ? (
              <EmptyState title="No leave types configured" hint="An administrator sets these up in Settings." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Type</Th>
                    <Th className="text-right">Entitled</Th>
                    <Th className="text-right">Taken</Th>
                    <Th className="text-right">Pending</Th>
                    <Th className="text-right">Remaining</Th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((balance) => (
                    <tr key={balance.leaveTypeId}>
                      <Td>
                        <span className="inline-flex items-center gap-2">
                          <span
                            aria-hidden
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: balance.colour }}
                          />
                          {balance.leaveTypeName}
                        </span>
                      </Td>
                      <Td className="text-right tabular-nums">{balance.entitled}</Td>
                      <Td className="text-right tabular-nums">{balance.taken}</Td>
                      <Td className="text-right tabular-nums text-[--color-muted]">{balance.pending || "—"}</Td>
                      <Td className="text-right font-semibold tabular-nums">{balance.remaining}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader title="Your requests" description={`Everything you have booked in ${year}.`} />
            {requests.length === 0 ? (
              <EmptyState title="Nothing booked yet" hint="Use the form to request time off." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Type</Th>
                    <Th>Dates</Th>
                    <Th className="text-right">Days</Th>
                    <Th>Status</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr key={request.id}>
                      <Td>{request.leaveType.name}</Td>
                      <Td className="whitespace-nowrap">
                        {formatDate(request.startDate)}
                        {request.startDate !== request.endDate ? ` – ${formatDate(request.endDate)}` : null}
                      </Td>
                      <Td className="text-right tabular-nums">{request.days}</Td>
                      <Td>
                        <Badge tone={leaveStatusTone(request.status)}>{humanise(request.status)}</Badge>
                      </Td>
                      <Td className="text-right">
                        {request.status === "PENDING" || request.status === "APPROVED" ? (
                          <CancelLeaveButton id={request.id} />
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Request leave" />
          <div className="p-5">
            <LeaveRequestForm types={types.map(({ id, name, allowsHalfDay }) => ({ id, name, allowsHalfDay }))} />
          </div>
        </Card>
      </div>
    </>
  );
}
