/**
 * Leave module (Phase 2).
 *
 * Two rules shape everything here:
 *
 *  1. A balance is never a stored number. It is the sum of that employee's
 *     ledger rows for a type and year, so every day can be traced to the grant,
 *     accrual, booking or adjustment that produced it.
 *  2. Day counts are computed once, at submission, and frozen on the request.
 *     If HR adds a public holiday next month, already-approved leave does not
 *     silently change value underneath the employee.
 */
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { recordAudit, type DbClient } from "@/lib/modules/audit/service";
import {
  accruedDays,
  countLeaveDays,
  leaveYearOf,
  rangesOverlap,
  round2,
  toDateOnly,
  toUtcDate,
  type DateOnly,
} from "@/lib/modules/leave/calendar";
import type {
  BalanceAdjustmentInput,
  HolidayInput,
  LeaveDecisionInput,
  LeaveListQuery,
  LeaveRequestInput,
  LeaveTypeInput,
} from "@/lib/modules/leave/schemas";
import {
  assertCan,
  assertCanAdjustBalance,
  assertCanCancelLeave,
  assertCanDecideLeave,
  assertCanRequestLeaveFor,
  assertCanViewLeave,
  assertSameTenant,
  canViewLeave,
  isAdmin,
  type Actor,
  type LeaveStatus,
} from "@/lib/permissions";
import { employeeTargetFor, getDownlineEmployeeIds } from "@/lib/permissions/scope";

/** Prisma hands Decimal columns back as Decimal objects; the app works in numbers. */
const num = (value: unknown): number => round2(Number(value));

// --- leave types -----------------------------------------------------------

export async function listLeaveTypes(actor: Actor, includeInactive = false) {
  // The active list is form data for anyone booking leave. The full list, with
  // usage counts, is configuration.
  assertCan(actor, includeInactive ? "leave:configure" : "leave:request");

  const types = await prisma.leaveType.findMany({
    where: { tenantId: actor.tenantId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: { name: "asc" },
    include: includeInactive ? { _count: { select: { requests: true } } } : undefined,
  });

  return types.map((type) => ({
    ...type,
    annualDays: num(type.annualDays),
    carryOverMaxDays: type.carryOverMaxDays === null ? null : num(type.carryOverMaxDays),
  }));
}

export async function createLeaveType(actor: Actor, input: LeaveTypeInput) {
  assertCan(actor, "leave:configure");

  const existing = await prisma.leaveType.findUnique({
    where: { tenantId_name: { tenantId: actor.tenantId, name: input.name } },
    select: { id: true },
  });
  if (existing) throw new ConflictError("That leave type already exists.");

  return prisma.$transaction(async (tx) => {
    const leaveType = await tx.leaveType.create({ data: { ...input, tenantId: actor.tenantId } });
    await recordAudit(tx, {
      actor,
      action: "CREATE",
      entityType: "LeaveType",
      entityId: leaveType.id,
      summary: `Added leave type ${leaveType.name}`,
    });
    return leaveType;
  });
}

export async function updateLeaveType(actor: Actor, id: string, input: LeaveTypeInput) {
  assertCan(actor, "leave:configure");

  const current = await prisma.leaveType.findUnique({ where: { id }, select: { id: true, tenantId: true, name: true } });
  if (!current) throw new NotFoundError("Leave type not found.");
  assertSameTenant(actor, current.tenantId);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.leaveType.update({ where: { id }, data: input });
    await recordAudit(tx, {
      actor,
      action: "UPDATE",
      entityType: "LeaveType",
      entityId: id,
      summary: `Updated leave type ${updated.name}`,
    });
    return updated;
  });
}

export async function deleteLeaveType(actor: Actor, id: string) {
  assertCan(actor, "leave:configure");

  const current = await prisma.leaveType.findUnique({
    where: { id },
    select: { id: true, tenantId: true, name: true, _count: { select: { requests: true, ledger: true } } },
  });
  if (!current) throw new NotFoundError("Leave type not found.");
  assertSameTenant(actor, current.tenantId);
  if (current._count.requests > 0 || current._count.ledger > 0) {
    throw new ValidationError("That type has history. Deactivate it instead of deleting it.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.leaveType.delete({ where: { id } });
    await recordAudit(tx, {
      actor,
      action: "DELETE",
      entityType: "LeaveType",
      entityId: id,
      summary: `Removed leave type ${current.name}`,
    });
  });
}

// --- holidays --------------------------------------------------------------

export async function listHolidays(actor: Actor, year?: number) {
  assertCan(actor, "leave:request");
  const holidays = await prisma.holiday.findMany({
    where: {
      tenantId: actor.tenantId,
      ...(year
        ? { date: { gte: toUtcDate(`${year}-01-01`), lte: toUtcDate(`${year}-12-31`) } }
        : {}),
    },
    orderBy: { date: "asc" },
  });
  return holidays.map((holiday) => ({ ...holiday, date: toDateOnly(holiday.date) }));
}

export async function createHoliday(actor: Actor, input: HolidayInput) {
  assertCan(actor, "leave:configure");

  const date = toUtcDate(input.date);
  const existing = await prisma.holiday.findUnique({
    where: { tenantId_date: { tenantId: actor.tenantId, date } },
    select: { id: true },
  });
  if (existing) throw new ConflictError("There is already a holiday on that date.");

  return prisma.$transaction(async (tx) => {
    const holiday = await tx.holiday.create({ data: { name: input.name, date, tenantId: actor.tenantId } });
    await recordAudit(tx, {
      actor,
      action: "CREATE",
      entityType: "Holiday",
      entityId: holiday.id,
      summary: `Added holiday ${holiday.name} on ${input.date}`,
    });
    return holiday;
  });
}

export async function deleteHoliday(actor: Actor, id: string) {
  assertCan(actor, "leave:configure");

  const current = await prisma.holiday.findUnique({ where: { id }, select: { id: true, tenantId: true, name: true } });
  if (!current) throw new NotFoundError("Holiday not found.");
  assertSameTenant(actor, current.tenantId);

  await prisma.$transaction(async (tx) => {
    await tx.holiday.delete({ where: { id } });
    await recordAudit(tx, {
      actor,
      action: "DELETE",
      entityType: "Holiday",
      entityId: id,
      summary: `Removed holiday ${current.name}`,
    });
  });
}

/** Holiday dates for a span, as the set the calendar helpers expect. */
async function holidaySet(tenantId: string, from: DateOnly, to: DateOnly): Promise<Set<DateOnly>> {
  const rows = await prisma.holiday.findMany({
    where: { tenantId, date: { gte: toUtcDate(from), lte: toUtcDate(to) } },
    select: { date: true },
  });
  return new Set(rows.map((row) => toDateOnly(row.date)));
}

// --- balances --------------------------------------------------------------

export interface LeaveBalance {
  leaveTypeId: string;
  leaveTypeName: string;
  colour: string;
  year: number;
  /** Entitlement earned so far (grants, accrual, carry-over, adjustments). */
  entitled: number;
  /** Days consumed by approved requests. */
  taken: number;
  /** Days held by requests still awaiting a decision. */
  pending: number;
  /** entitled - taken - pending. What is actually still bookable. */
  remaining: number;
}

/**
 * Balances for one employee across every active leave type.
 *
 * Entitlement is the ledger plus whatever accrual the type implies but has not
 * been written yet — so a new tenant sees sensible numbers on day one without a
 * nightly job having run.
 */
export async function getBalances(actor: Actor, employeeId: string, year = new Date().getUTCFullYear()): Promise<LeaveBalance[]> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, tenantId: true, startDate: true },
  });
  if (!employee) throw new NotFoundError("Employee not found.");
  assertSameTenant(actor, employee.tenantId);
  assertCanViewLeave(actor, await employeeTargetFor(actor, employee));

  const [types, ledger, requests] = await Promise.all([
    prisma.leaveType.findMany({ where: { tenantId: actor.tenantId, isActive: true }, orderBy: { name: "asc" } }),
    prisma.leaveLedgerEntry.groupBy({
      by: ["leaveTypeId", "reason"],
      where: { employeeId, year, tenantId: actor.tenantId },
      _sum: { days: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId,
        tenantId: actor.tenantId,
        status: "PENDING",
        startDate: { gte: toUtcDate(`${year}-01-01`), lte: toUtcDate(`${year}-12-31`) },
      },
      select: { leaveTypeId: true, days: true },
    }),
  ]);

  const asOf = toDateOnly(new Date());
  const startDate = employee.startDate ? toDateOnly(employee.startDate) : null;

  return types.map((type) => {
    const rows = ledger.filter((row) => row.leaveTypeId === type.id);
    const sumOf = (...reasons: string[]) =>
      rows.filter((row) => reasons.includes(row.reason)).reduce((total, row) => total + Number(row._sum.days ?? 0), 0);

    // Accrual rows may not exist yet; fall back to what the policy implies.
    const writtenEntitlement = sumOf("GRANT", "ACCRUAL", "CARRY_OVER", "ADJUSTMENT");
    const implied = accruedDays(type.accrualMethod, num(type.annualDays), year, startDate, asOf);
    const hasWrittenGrant = rows.some((row) => row.reason === "GRANT" || row.reason === "ACCRUAL");
    const entitled = round2(hasWrittenGrant ? writtenEntitlement : writtenEntitlement + implied);

    // TAKEN and REFUND rows are stored signed, so this sum is already net.
    const taken = round2(-sumOf("TAKEN", "REFUND"));
    const pending = round2(
      requests.filter((row) => row.leaveTypeId === type.id).reduce((total, row) => total + Number(row.days), 0),
    );

    return {
      leaveTypeId: type.id,
      leaveTypeName: type.name,
      colour: type.colour,
      year,
      entitled,
      taken,
      pending,
      remaining: round2(entitled - taken - pending),
    };
  });
}

export async function adjustBalance(actor: Actor, input: BalanceAdjustmentInput) {
  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, tenantId: true, firstName: true, lastName: true },
  });
  if (!employee) throw new NotFoundError("Employee not found.");
  assertSameTenant(actor, employee.tenantId);
  assertCanAdjustBalance(actor, await employeeTargetFor(actor, employee));

  const leaveType = await prisma.leaveType.findUnique({
    where: { id: input.leaveTypeId },
    select: { id: true, tenantId: true, name: true },
  });
  if (!leaveType) throw new NotFoundError("Leave type not found.");
  assertSameTenant(actor, leaveType.tenantId);

  return prisma.$transaction(async (tx) => {
    const entry = await tx.leaveLedgerEntry.create({
      data: {
        tenantId: actor.tenantId,
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        year: input.year,
        days: input.days,
        reason: "ADJUSTMENT",
        note: input.note,
        createdById: actor.userId,
      },
    });
    await recordAudit(tx, {
      actor,
      action: "UPDATE",
      entityType: "LeaveLedgerEntry",
      entityId: entry.id,
      summary: `Adjusted ${leaveType.name} for ${employee.firstName} ${employee.lastName} by ${input.days} day(s)`,
      changes: { days: { from: 0, to: input.days }, note: { from: null, to: input.note } },
    });
    return entry;
  });
}

/** The ledger behind a balance — the "why is it 12.5?" view. */
export async function getLedger(actor: Actor, employeeId: string, leaveTypeId: string, year: number) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, tenantId: true } });
  if (!employee) throw new NotFoundError("Employee not found.");
  assertSameTenant(actor, employee.tenantId);
  assertCanViewLeave(actor, await employeeTargetFor(actor, employee));

  const rows = await prisma.leaveLedgerEntry.findMany({
    where: { employeeId, leaveTypeId, year, tenantId: actor.tenantId },
    orderBy: { createdAt: "asc" },
    include: { request: { select: { id: true, startDate: true, endDate: true } } },
  });

  let running = 0;
  return rows.map((row) => {
    running = round2(running + Number(row.days));
    return { ...row, days: num(row.days), balanceAfter: running };
  });
}

// --- requests --------------------------------------------------------------

const requestInclude = {
  leaveType: { select: { id: true, name: true, colour: true, isPaid: true } },
  employee: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
  decidedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.LeaveRequestInclude;

type RawRequest = Prisma.LeaveRequestGetPayload<{ include: typeof requestInclude }>;

function serialiseRequest(row: RawRequest, includeReason: boolean) {
  return {
    ...row,
    startDate: toDateOnly(row.startDate),
    endDate: toDateOnly(row.endDate),
    days: num(row.days),
    // When someone is away is company knowledge; why they are away is not.
    reason: includeReason ? row.reason : null,
    decisionNote: includeReason ? row.decisionNote : null,
  };
}

export async function listLeaveRequests(actor: Actor, query: LeaveListQuery) {
  assertCan(actor, "leave:request");

  const where: Prisma.LeaveRequestWhereInput = { tenantId: actor.tenantId };
  if (query.status) where.status = query.status;
  if (query.year) {
    where.startDate = { gte: toUtcDate(`${query.year}-01-01`), lte: toUtcDate(`${query.year}-12-31`) };
  }

  if (query.scope === "mine") {
    if (!actor.employeeId) return [];
    where.employeeId = actor.employeeId;
  } else if (query.scope === "team") {
    // The approval inbox: everyone the actor may decide for, never themselves.
    if (isAdmin(actor.role)) {
      if (actor.employeeId) where.employeeId = { not: actor.employeeId };
    } else {
      const downline = await getDownlineEmployeeIds(actor.tenantId, actor.employeeId);
      if (downline.size === 0) return [];
      where.employeeId = { in: [...downline] };
    }
  } else {
    // "all" is an HR view.
    assertCan(actor, "leave:manage");
    if (query.employeeId) where.employeeId = query.employeeId;
  }

  const rows = await prisma.leaveRequest.findMany({
    where,
    include: requestInclude,
    orderBy: [{ startDate: "desc" }],
    take: 200,
  });

  // Reason visibility is decided per row, against the same policy the profile uses.
  const targets = await Promise.all(
    rows.map((row) => employeeTargetFor(actor, { id: row.employeeId, tenantId: row.tenantId })),
  );

  return rows.map((row, index) => serialiseRequest(row, canViewLeave(actor, targets[index])));
}

export async function getLeaveRequest(actor: Actor, id: string) {
  const row = await prisma.leaveRequest.findUnique({ where: { id }, include: requestInclude });
  if (!row) throw new NotFoundError("Leave request not found.");
  assertSameTenant(actor, row.tenantId);

  const target = await employeeTargetFor(actor, { id: row.employeeId, tenantId: row.tenantId });
  assertCanViewLeave(actor, target);
  return serialiseRequest(row, true);
}

/**
 * Book leave.
 *
 * The overlap check and the balance check both run inside the transaction that
 * writes the request, so two requests submitted at the same moment cannot both
 * pass a check the other invalidates.
 */
export async function createLeaveRequest(actor: Actor, input: LeaveRequestInput) {
  assertCan(actor, "leave:request");

  const employeeId = input.employeeId ?? actor.employeeId;
  if (!employeeId) {
    throw new ValidationError("Your login is not linked to an employee record, so you cannot book leave.");
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, tenantId: true, firstName: true, lastName: true, status: true },
  });
  if (!employee) throw new NotFoundError("Employee not found.");
  assertSameTenant(actor, employee.tenantId);
  assertCanRequestLeaveFor(actor, await employeeTargetFor(actor, employee));

  if (employee.status === "TERMINATED") {
    throw new ValidationError("That employee has left the organisation.");
  }

  const leaveType = await prisma.leaveType.findUnique({ where: { id: input.leaveTypeId } });
  if (!leaveType) throw new NotFoundError("Leave type not found.");
  assertSameTenant(actor, leaveType.tenantId);
  if (!leaveType.isActive) throw new ValidationError("That leave type is no longer available.");

  if ((input.startHalf || input.endHalf) && !leaveType.allowsHalfDay) {
    throw new ValidationError(`${leaveType.name} cannot be taken in half days.`);
  }

  const holidays = await holidaySet(actor.tenantId, input.startDate, input.endDate);
  const days = countLeaveDays(
    { start: input.startDate, end: input.endDate, startHalf: input.startHalf, endHalf: input.endHalf },
    holidays,
  );
  if (days <= 0) {
    throw new ValidationError("That range contains no working days.");
  }

  const year = leaveYearOf(input.startDate);
  const autoApprove = !leaveType.requiresApproval;

  return prisma.$transaction(async (tx) => {
    // Overlap: any request for the same employee that is still live.
    const live = await tx.leaveRequest.findMany({
      where: {
        employeeId,
        tenantId: actor.tenantId,
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: toUtcDate(input.endDate) },
        endDate: { gte: toUtcDate(input.startDate) },
      },
      select: { id: true, startDate: true, endDate: true },
    });
    const clash = live.find((row) =>
      rangesOverlap(
        { start: input.startDate, end: input.endDate },
        { start: toDateOnly(row.startDate), end: toDateOnly(row.endDate) },
      ),
    );
    if (clash) {
      throw new ConflictError("You already have leave booked over those dates.");
    }

    if (!leaveType.allowsNegative) {
      const balances = await balanceWithin(tx, actor.tenantId, employeeId, leaveType.id, year);
      if (balances.remaining < days) {
        throw new ValidationError(
          `That request needs ${days} day(s) but only ${balances.remaining} remain for ${leaveType.name}.`,
        );
      }
    }

    const request = await tx.leaveRequest.create({
      data: {
        tenantId: actor.tenantId,
        employeeId,
        leaveTypeId: leaveType.id,
        startDate: toUtcDate(input.startDate),
        endDate: toUtcDate(input.endDate),
        startHalf: input.startHalf,
        endHalf: input.endHalf,
        days,
        reason: input.reason ?? null,
        status: autoApprove ? "APPROVED" : "PENDING",
        decidedById: autoApprove ? (actor.employeeId ?? null) : null,
        decidedAt: autoApprove ? new Date() : null,
      },
      include: requestInclude,
    });

    // Only approved leave touches the ledger. Pending days are held back by the
    // balance calculation instead, so a rejected request leaves no trace to undo.
    if (autoApprove) {
      await writeLedger(tx, actor, request.id, employeeId, leaveType.id, year, -days, "TAKEN");
    }

    await recordAudit(tx, {
      actor,
      action: "CREATE",
      entityType: "LeaveRequest",
      entityId: request.id,
      summary: `${autoApprove ? "Booked" : "Requested"} ${days} day(s) ${leaveType.name} for ${employee.firstName} ${employee.lastName}`,
    });

    return serialiseRequest(request, true);
  });
}

export async function decideLeaveRequest(actor: Actor, id: string, input: LeaveDecisionInput) {
  const existing = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { leaveType: { select: { id: true, name: true } }, employee: { select: { firstName: true, lastName: true } } },
  });
  if (!existing) throw new NotFoundError("Leave request not found.");
  assertSameTenant(actor, existing.tenantId);

  const employeeTarget = await employeeTargetFor(actor, { id: existing.employeeId, tenantId: existing.tenantId });
  assertCanDecideLeave(actor, {
    tenantId: existing.tenantId,
    employee: employeeTarget,
    status: existing.status as LeaveStatus,
  });

  const days = num(existing.days);
  const year = leaveYearOf(toDateOnly(existing.startDate));

  return prisma.$transaction(async (tx) => {
    const updated = await tx.leaveRequest.update({
      where: { id },
      data: {
        status: input.decision,
        decidedById: actor.employeeId,
        decidedAt: new Date(),
        decisionNote: input.note ?? null,
      },
      include: requestInclude,
    });

    if (input.decision === "APPROVED") {
      await writeLedger(tx, actor, id, existing.employeeId, existing.leaveTypeId, year, -days, "TAKEN");
    }

    await recordAudit(tx, {
      actor,
      action: "UPDATE",
      entityType: "LeaveRequest",
      entityId: id,
      summary: `${input.decision === "APPROVED" ? "Approved" : "Rejected"} ${days} day(s) ${existing.leaveType.name} for ${existing.employee.firstName} ${existing.employee.lastName}`,
      changes: { status: { from: existing.status, to: input.decision } },
    });

    return serialiseRequest(updated, true);
  });
}

/**
 * Withdraw a request. Approved leave that is cancelled refunds its days with a
 * compensating ledger row rather than deleting the original booking — the trail
 * has to show that the days were taken and then given back.
 */
export async function cancelLeaveRequest(actor: Actor, id: string) {
  const existing = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { leaveType: { select: { id: true, name: true } } },
  });
  if (!existing) throw new NotFoundError("Leave request not found.");
  assertSameTenant(actor, existing.tenantId);

  const employeeTarget = await employeeTargetFor(actor, { id: existing.employeeId, tenantId: existing.tenantId });
  assertCanCancelLeave(actor, {
    tenantId: existing.tenantId,
    employee: employeeTarget,
    status: existing.status as LeaveStatus,
  });

  const days = num(existing.days);
  const year = leaveYearOf(toDateOnly(existing.startDate));
  const wasApproved = existing.status === "APPROVED";

  return prisma.$transaction(async (tx) => {
    const updated = await tx.leaveRequest.update({
      where: { id },
      data: { status: "CANCELLED", decidedById: actor.employeeId, decidedAt: new Date() },
      include: requestInclude,
    });

    if (wasApproved) {
      await writeLedger(tx, actor, id, existing.employeeId, existing.leaveTypeId, year, days, "REFUND");
    }

    await recordAudit(tx, {
      actor,
      action: "UPDATE",
      entityType: "LeaveRequest",
      entityId: id,
      summary: `Cancelled ${days} day(s) ${existing.leaveType.name}`,
      changes: { status: { from: existing.status, to: "CANCELLED" } },
    });

    return serialiseRequest(updated, true);
  });
}

/** Who is off between two dates — the team calendar. Reasons are never included. */
export async function listTeamAbsences(actor: Actor, from: DateOnly, to: DateOnly) {
  assertCan(actor, "leave:request");

  const rows = await prisma.leaveRequest.findMany({
    where: {
      tenantId: actor.tenantId,
      status: "APPROVED",
      startDate: { lte: toUtcDate(to) },
      endDate: { gte: toUtcDate(from) },
    },
    include: requestInclude,
    orderBy: { startDate: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    employee: row.employee,
    leaveType: { name: row.leaveType.name, colour: row.leaveType.colour },
    startDate: toDateOnly(row.startDate),
    endDate: toDateOnly(row.endDate),
    days: num(row.days),
  }));
}

// --- internals -------------------------------------------------------------

async function writeLedger(
  tx: DbClient,
  actor: Actor,
  requestId: string,
  employeeId: string,
  leaveTypeId: string,
  year: number,
  days: number,
  reason: "TAKEN" | "REFUND",
): Promise<void> {
  await tx.leaveLedgerEntry.create({
    data: {
      tenantId: actor.tenantId,
      employeeId,
      leaveTypeId,
      year,
      days,
      reason,
      requestId,
      createdById: actor.userId,
    },
  });
}

/**
 * The same balance maths as `getBalances` but for one type, inside a
 * transaction and without permission checks — the caller has already done them.
 */
async function balanceWithin(
  tx: DbClient,
  tenantId: string,
  employeeId: string,
  leaveTypeId: string,
  year: number,
): Promise<{ remaining: number }> {
  const [type, employee, ledger, pending] = await Promise.all([
    tx.leaveType.findUnique({ where: { id: leaveTypeId } }),
    tx.employee.findUnique({ where: { id: employeeId }, select: { startDate: true } }),
    tx.leaveLedgerEntry.groupBy({
      by: ["reason"],
      where: { employeeId, leaveTypeId, year, tenantId },
      _sum: { days: true },
    }),
    tx.leaveRequest.aggregate({
      where: {
        employeeId,
        leaveTypeId,
        tenantId,
        status: "PENDING",
        startDate: { gte: toUtcDate(`${year}-01-01`), lte: toUtcDate(`${year}-12-31`) },
      },
      _sum: { days: true },
    }),
  ]);

  if (!type) return { remaining: 0 };

  const sumOf = (...reasons: string[]) =>
    ledger.filter((row) => reasons.includes(row.reason)).reduce((total, row) => total + Number(row._sum.days ?? 0), 0);

  const written = sumOf("GRANT", "ACCRUAL", "CARRY_OVER", "ADJUSTMENT");
  const hasWrittenGrant = ledger.some((row) => row.reason === "GRANT" || row.reason === "ACCRUAL");
  const implied = accruedDays(
    type.accrualMethod,
    num(type.annualDays),
    year,
    employee?.startDate ? toDateOnly(employee.startDate) : null,
    toDateOnly(new Date()),
  );

  const entitled = round2(hasWrittenGrant ? written : written + implied);
  const taken = round2(-sumOf("TAKEN", "REFUND"));
  const held = round2(Number(pending._sum.days ?? 0));

  return { remaining: round2(entitled - taken - held) };
}
