/**
 * Time & attendance (Phase 2).
 *
 * Hours live as individual entries; a week is the unit that gets submitted and
 * approved. Two decisions shape the rest:
 *
 *  1. A timesheet row is created lazily, the first time someone records against
 *     that week. Weeks nobody worked leave no rows behind.
 *  2. Expected hours are derived from the tenant's contracted week, less
 *     weekends, public holidays, and any approved leave — so a week with a day
 *     off does not read as a day of missing time.
 */
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { recordAudit, type DbClient } from "@/lib/modules/audit/service";
import {
  addDays,
  countLeaveDays,
  eachDate,
  minutesToHours,
  round2,
  toDateOnly,
  toUtcDate,
  weekEndOf,
  weekStartOf,
  workingDates,
  type DateOnly,
} from "@/lib/modules/leave/calendar";
import type {
  ClockInInput,
  TimeEntryInput,
  TimeEntryUpdateInput,
  TimesheetDecisionInput,
  TimesheetListQuery,
} from "@/lib/modules/time/schemas";
import {
  assertCan,
  assertCanDecideTimesheet,
  assertCanEditTimeEntry,
  assertCanRecordTimeFor,
  assertCanSubmitTimesheet,
  assertCanViewTimesheet,
  assertSameTenant,
  isAdmin,
  type Actor,
  type TimesheetStatusValue,
} from "@/lib/permissions";
import { employeeTargetFor, getDownlineEmployeeIds } from "@/lib/permissions/scope";

/** Combine a work date and an `HH:MM` into the UTC instant we store. */
function at(workDate: DateOnly, time: string): Date {
  return new Date(`${workDate}T${time}:00.000Z`);
}

/** The `HH:MM` a stored instant represents, for round-tripping into a form. */
function timeOf(value: Date): string {
  return value.toISOString().slice(11, 16);
}

function minutesBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60_000);
}

// --- week assembly ---------------------------------------------------------

export interface WeekDay {
  date: DateOnly;
  isWorkingDay: boolean;
  holidayName: string | null;
  leaveTypeName: string | null;
  leaveDays: number;
  minutes: number;
  entries: {
    id: string;
    startTime: string;
    endTime: string | null;
    minutes: number;
    note: string | null;
    source: string;
    running: boolean;
  }[];
}

export interface WeekView {
  employeeId: string;
  weekStart: DateOnly;
  weekEnd: DateOnly;
  status: TimesheetStatusValue;
  timesheetId: string | null;
  decisionNote: string | null;
  decidedBy: { firstName: string; lastName: string } | null;
  days: WeekDay[];
  /** Minutes actually recorded across the week. */
  totalMinutes: number;
  /** Minutes the contract expects, after weekends, holidays and leave. */
  expectedMinutes: number;
  overtimeMinutes: number;
  editable: boolean;
  runningEntryId: string | null;
}

/**
 * Everything the timesheet screen needs for one employee-week, including the
 * leave and holidays that reduce what is expected of them.
 */
export async function getWeek(actor: Actor, employeeId: string, anyDateInWeek?: DateOnly): Promise<WeekView> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, tenantId: true },
  });
  if (!employee) throw new NotFoundError("Employee not found.");
  assertSameTenant(actor, employee.tenantId);
  assertCanViewTimesheet(actor, await employeeTargetFor(actor, employee));

  const weekStart = weekStartOf(anyDateInWeek ?? toDateOnly(new Date()));
  const weekEnd = weekEndOf(weekStart);

  const [timesheet, entries, holidays, leave, tenant] = await Promise.all([
    prisma.timesheet.findUnique({
      where: { employeeId_weekStart: { employeeId, weekStart: toUtcDate(weekStart) } },
      include: { decidedBy: { select: { firstName: true, lastName: true } } },
    }),
    prisma.timeEntry.findMany({
      where: {
        employeeId,
        tenantId: actor.tenantId,
        workDate: { gte: toUtcDate(weekStart), lte: toUtcDate(weekEnd) },
      },
      orderBy: [{ workDate: "asc" }, { startedAt: "asc" }],
    }),
    prisma.holiday.findMany({
      where: { tenantId: actor.tenantId, date: { gte: toUtcDate(weekStart), lte: toUtcDate(weekEnd) } },
    }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId,
        tenantId: actor.tenantId,
        status: "APPROVED",
        startDate: { lte: toUtcDate(weekEnd) },
        endDate: { gte: toUtcDate(weekStart) },
      },
      include: { leaveType: { select: { name: true } } },
    }),
    prisma.tenant.findUnique({ where: { id: actor.tenantId }, select: { standardWeeklyHours: true } }),
  ]);

  const holidayNames = new Map(holidays.map((holiday) => [toDateOnly(holiday.date), holiday.name]));
  const holidayDates = new Set(holidayNames.keys());

  // A leave request may straddle the week; only the days inside it count here.
  const leaveByDate = new Map<DateOnly, { name: string; days: number }>();
  for (const request of leave) {
    const span = { start: toDateOnly(request.startDate), end: toDateOnly(request.endDate) };
    for (const date of eachDate(span.start, span.end)) {
      if (date < weekStart || date > weekEnd) continue;
      if (holidayDates.has(date)) continue;
      const dayCost = countLeaveDays(
        {
          start: date,
          end: date,
          startHalf: request.startHalf && date === span.start,
          endHalf: request.endHalf && date === span.end,
        },
        holidayDates,
      );
      if (dayCost > 0) leaveByDate.set(date, { name: request.leaveType.name, days: dayCost });
    }
  }

  const status = (timesheet?.status ?? "OPEN") as TimesheetStatusValue;
  const dailyExpectedMinutes = (Number(tenant?.standardWeeklyHours ?? 40) / 5) * 60;

  let totalMinutes = 0;
  let expectedMinutes = 0;
  let runningEntryId: string | null = null;

  const days: WeekDay[] = eachDate(weekStart, weekEnd).map((date) => {
    const dayEntries = entries.filter((entry) => toDateOnly(entry.workDate) === date);
    const dayMinutes = dayEntries.reduce((total, entry) => total + entry.minutes, 0);
    totalMinutes += dayMinutes;

    const isWorkingDay = workingDates(date, date, holidayDates).length === 1;
    const onLeave = leaveByDate.get(date);
    if (isWorkingDay) {
      // A half day of leave halves what is expected, not the whole day.
      expectedMinutes += dailyExpectedMinutes * (1 - (onLeave?.days ?? 0));
    }

    for (const entry of dayEntries) {
      if (!entry.endedAt) runningEntryId = entry.id;
    }

    return {
      date,
      isWorkingDay,
      holidayName: holidayNames.get(date) ?? null,
      leaveTypeName: onLeave?.name ?? null,
      leaveDays: onLeave?.days ?? 0,
      minutes: dayMinutes,
      entries: dayEntries.map((entry) => ({
        id: entry.id,
        startTime: timeOf(entry.startedAt),
        endTime: entry.endedAt ? timeOf(entry.endedAt) : null,
        minutes: entry.minutes,
        note: entry.note,
        source: entry.source,
        running: entry.endedAt === null,
      })),
    };
  });

  expectedMinutes = Math.round(expectedMinutes);

  return {
    employeeId,
    weekStart,
    weekEnd,
    status,
    timesheetId: timesheet?.id ?? null,
    decisionNote: timesheet?.decisionNote ?? null,
    decidedBy: timesheet?.decidedBy ?? null,
    days,
    totalMinutes,
    expectedMinutes,
    overtimeMinutes: Math.max(0, totalMinutes - expectedMinutes),
    editable: status === "OPEN" || status === "REJECTED" || (status === "SUBMITTED" && isAdmin(actor.role)),
    runningEntryId,
  };
}

// --- entries ---------------------------------------------------------------

/** The timesheet a work date belongs to, created on first use. */
async function timesheetFor(tx: DbClient, tenantId: string, employeeId: string, workDate: DateOnly) {
  const weekStart = toUtcDate(weekStartOf(workDate));
  const existing = await tx.timesheet.findUnique({ where: { employeeId_weekStart: { employeeId, weekStart } } });
  if (existing) return existing;
  return tx.timesheet.create({ data: { tenantId, employeeId, weekStart } });
}

/** Load the policy context for the week a date sits in. */
async function timesheetTargetFor(actor: Actor, employee: { id: string; tenantId: string }, workDate: DateOnly) {
  const sheet = await prisma.timesheet.findUnique({
    where: { employeeId_weekStart: { employeeId: employee.id, weekStart: toUtcDate(weekStartOf(workDate)) } },
    select: { status: true },
  });
  return {
    tenantId: employee.tenantId,
    employee: await employeeTargetFor(actor, employee),
    status: (sheet?.status ?? "OPEN") as TimesheetStatusValue,
  };
}

async function resolveEmployee(actor: Actor, employeeId?: string) {
  const id = employeeId ?? actor.employeeId;
  if (!id) throw new ValidationError("Your login is not linked to an employee record.");
  const employee = await prisma.employee.findUnique({ where: { id }, select: { id: true, tenantId: true } });
  if (!employee) throw new NotFoundError("Employee not found.");
  assertSameTenant(actor, employee.tenantId);
  return employee;
}

export async function createTimeEntry(actor: Actor, input: TimeEntryInput) {
  assertCan(actor, "time:track");
  const employee = await resolveEmployee(actor, input.employeeId);
  assertCanRecordTimeFor(actor, await employeeTargetFor(actor, employee));
  assertCanEditTimeEntry(actor, await timesheetTargetFor(actor, employee, input.workDate));

  const startedAt = at(input.workDate, input.startTime);
  const endedAt = at(input.workDate, input.endTime);
  const minutes = minutesBetween(startedAt, endedAt);
  if (minutes <= 0) throw new ValidationError("The end time must be after the start time.");
  if (minutes > 24 * 60) throw new ValidationError("A single entry cannot exceed 24 hours.");

  return prisma.$transaction(async (tx) => {
    await assertNoOverlap(tx, employee.id, input.workDate, startedAt, endedAt, null);
    await timesheetFor(tx, actor.tenantId, employee.id, input.workDate);

    const entry = await tx.timeEntry.create({
      data: {
        tenantId: actor.tenantId,
        employeeId: employee.id,
        workDate: toUtcDate(input.workDate),
        startedAt,
        endedAt,
        minutes,
        note: input.note ?? null,
        source: "MANUAL",
        createdById: actor.userId,
      },
    });

    await recordAudit(tx, {
      actor,
      action: "CREATE",
      entityType: "TimeEntry",
      entityId: entry.id,
      summary: `Recorded ${minutesToHours(minutes)}h on ${input.workDate}`,
    });

    return entry;
  });
}

export async function updateTimeEntry(actor: Actor, id: string, input: TimeEntryUpdateInput) {
  assertCan(actor, "time:track");

  const existing = await prisma.timeEntry.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Time entry not found.");
  assertSameTenant(actor, existing.tenantId);

  const employee = await resolveEmployee(actor, existing.employeeId);
  const workDate = toDateOnly(existing.workDate);
  assertCanRecordTimeFor(actor, await employeeTargetFor(actor, employee));
  assertCanEditTimeEntry(actor, await timesheetTargetFor(actor, employee, workDate));

  const startedAt = at(workDate, input.startTime);
  const endedAt = at(workDate, input.endTime);
  const minutes = minutesBetween(startedAt, endedAt);
  if (minutes <= 0) throw new ValidationError("The end time must be after the start time.");

  return prisma.$transaction(async (tx) => {
    await assertNoOverlap(tx, employee.id, workDate, startedAt, endedAt, id);
    const updated = await tx.timeEntry.update({
      where: { id },
      data: { startedAt, endedAt, minutes, note: input.note ?? null },
    });
    await recordAudit(tx, {
      actor,
      action: "UPDATE",
      entityType: "TimeEntry",
      entityId: id,
      summary: `Changed hours on ${workDate}`,
      changes: { minutes: { from: existing.minutes, to: minutes } },
    });
    return updated;
  });
}

export async function deleteTimeEntry(actor: Actor, id: string) {
  assertCan(actor, "time:track");

  const existing = await prisma.timeEntry.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Time entry not found.");
  assertSameTenant(actor, existing.tenantId);

  const employee = await resolveEmployee(actor, existing.employeeId);
  const workDate = toDateOnly(existing.workDate);
  assertCanRecordTimeFor(actor, await employeeTargetFor(actor, employee));
  assertCanEditTimeEntry(actor, await timesheetTargetFor(actor, employee, workDate));

  await prisma.$transaction(async (tx) => {
    await tx.timeEntry.delete({ where: { id } });
    await recordAudit(tx, {
      actor,
      action: "DELETE",
      entityType: "TimeEntry",
      entityId: id,
      summary: `Removed ${minutesToHours(existing.minutes)}h from ${workDate}`,
    });
  });
}

/**
 * Two entries on the same day may not cover the same minutes. Without this you
 * can bill the same hour twice by clocking in on two devices.
 */
async function assertNoOverlap(
  tx: DbClient,
  employeeId: string,
  workDate: DateOnly,
  startedAt: Date,
  endedAt: Date,
  ignoreId: string | null,
): Promise<void> {
  const sameDay = await tx.timeEntry.findMany({
    where: { employeeId, workDate: toUtcDate(workDate), ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    select: { id: true, startedAt: true, endedAt: true },
  });

  const clash = sameDay.some((entry) => {
    const otherEnd = entry.endedAt ?? entry.startedAt;
    return startedAt < otherEnd && entry.startedAt < endedAt;
  });
  if (clash) throw new ConflictError("That overlaps hours already recorded for this day.");
}

// --- the clock -------------------------------------------------------------

export async function clockIn(actor: Actor, input: ClockInInput) {
  assertCan(actor, "time:track");
  const employee = await resolveEmployee(actor);
  assertCanRecordTimeFor(actor, await employeeTargetFor(actor, employee));

  const now = new Date();
  const workDate = toDateOnly(now);
  assertCanEditTimeEntry(actor, await timesheetTargetFor(actor, employee, workDate));

  return prisma.$transaction(async (tx) => {
    const running = await tx.timeEntry.findFirst({ where: { employeeId: employee.id, endedAt: null } });
    if (running) throw new ConflictError("You are already clocked in.");

    await timesheetFor(tx, actor.tenantId, employee.id, workDate);
    const entry = await tx.timeEntry.create({
      data: {
        tenantId: actor.tenantId,
        employeeId: employee.id,
        workDate: toUtcDate(workDate),
        startedAt: now,
        minutes: 0,
        note: input.note ?? null,
        source: "CLOCK",
        createdById: actor.userId,
      },
    });
    return entry;
  });
}

export async function clockOut(actor: Actor) {
  assertCan(actor, "time:track");
  const employee = await resolveEmployee(actor);
  assertCanRecordTimeFor(actor, await employeeTargetFor(actor, employee));

  return prisma.$transaction(async (tx) => {
    const running = await tx.timeEntry.findFirst({
      where: { employeeId: employee.id, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    if (!running) throw new ValidationError("You are not clocked in.");

    const now = new Date();
    const minutes = Math.max(1, minutesBetween(running.startedAt, now));

    const entry = await tx.timeEntry.update({ where: { id: running.id }, data: { endedAt: now, minutes } });
    await recordAudit(tx, {
      actor,
      action: "UPDATE",
      entityType: "TimeEntry",
      entityId: entry.id,
      summary: `Clocked out after ${minutesToHours(minutes)}h`,
    });
    return entry;
  });
}

/** The open clock, if any — the dashboard asks on every load. */
export async function getRunningEntry(actor: Actor) {
  if (!actor.employeeId) return null;
  const running = await prisma.timeEntry.findFirst({
    where: { employeeId: actor.employeeId, tenantId: actor.tenantId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  return running ? { id: running.id, startedAt: running.startedAt.toISOString(), workDate: toDateOnly(running.workDate) } : null;
}

// --- submission and approval -----------------------------------------------

export async function submitTimesheet(actor: Actor, employeeId: string | undefined, week: DateOnly) {
  assertCan(actor, "time:track");
  const employee = await resolveEmployee(actor, employeeId);
  const weekStart = weekStartOf(week);
  assertCanSubmitTimesheet(actor, await timesheetTargetFor(actor, employee, weekStart));

  const view = await getWeek(actor, employee.id, weekStart);
  if (view.totalMinutes === 0) throw new ValidationError("There are no hours to submit for that week.");
  if (view.runningEntryId) throw new ValidationError("Clock out before submitting the week.");

  return prisma.$transaction(async (tx) => {
    const sheet = await timesheetFor(tx, actor.tenantId, employee.id, weekStart);
    const updated = await tx.timesheet.update({
      where: { id: sheet.id },
      data: { status: "SUBMITTED", submittedAt: new Date(), decisionNote: null },
    });
    await recordAudit(tx, {
      actor,
      action: "UPDATE",
      entityType: "Timesheet",
      entityId: sheet.id,
      summary: `Submitted week of ${weekStart} (${minutesToHours(view.totalMinutes)}h)`,
    });
    return updated;
  });
}

export async function decideTimesheet(actor: Actor, id: string, input: TimesheetDecisionInput) {
  const sheet = await prisma.timesheet.findUnique({ where: { id }, include: { employee: { select: { id: true, tenantId: true } } } });
  if (!sheet) throw new NotFoundError("Timesheet not found.");
  assertSameTenant(actor, sheet.tenantId);

  assertCanDecideTimesheet(actor, {
    tenantId: sheet.tenantId,
    employee: await employeeTargetFor(actor, sheet.employee),
    status: sheet.status as TimesheetStatusValue,
  });

  const weekStart = toDateOnly(sheet.weekStart);
  const view = await getWeek(actor, sheet.employeeId, weekStart);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.timesheet.update({
      where: { id },
      data: {
        status: input.decision,
        // Freeze the total at approval so a later edit cannot rewrite history.
        totalMinutes: input.decision === "APPROVED" ? view.totalMinutes : null,
        decidedById: actor.employeeId,
        decidedAt: new Date(),
        decisionNote: input.note ?? null,
      },
    });
    await recordAudit(tx, {
      actor,
      action: "UPDATE",
      entityType: "Timesheet",
      entityId: id,
      summary: `${input.decision === "APPROVED" ? "Approved" : "Sent back"} week of ${weekStart}`,
      changes: { status: { from: sheet.status, to: input.decision } },
    });
    return updated;
  });
}

export async function listTimesheets(actor: Actor, query: TimesheetListQuery) {
  assertCan(actor, "time:track");

  const where: Prisma.TimesheetWhereInput = { tenantId: actor.tenantId };
  if (query.status) where.status = query.status;

  if (query.scope === "mine") {
    if (!actor.employeeId) return [];
    where.employeeId = actor.employeeId;
  } else if (isAdmin(actor.role)) {
    if (actor.employeeId) where.employeeId = { not: actor.employeeId };
  } else {
    const downline = await getDownlineEmployeeIds(actor.tenantId, actor.employeeId);
    if (downline.size === 0) return [];
    where.employeeId = { in: [...downline] };
  }

  const sheets = await prisma.timesheet.findMany({
    where,
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
      decidedBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ weekStart: "desc" }],
    take: 100,
  });

  // Submitted weeks have no frozen total yet, so their hours are summed live.
  const pendingIds = sheets.filter((sheet) => sheet.totalMinutes === null).map((sheet) => sheet.id);
  const liveTotals = new Map<string, number>();
  if (pendingIds.length > 0) {
    const rows = await prisma.timeEntry.groupBy({
      by: ["employeeId", "workDate"],
      where: { tenantId: actor.tenantId, employeeId: { in: sheets.map((sheet) => sheet.employeeId) } },
      _sum: { minutes: true },
    });
    for (const sheet of sheets) {
      if (sheet.totalMinutes !== null) continue;
      const start = toDateOnly(sheet.weekStart);
      const end = addDays(start, 6);
      const total = rows
        .filter((row) => row.employeeId === sheet.employeeId)
        .filter((row) => {
          const date = toDateOnly(row.workDate);
          return date >= start && date <= end;
        })
        .reduce((sum, row) => sum + (row._sum.minutes ?? 0), 0);
      liveTotals.set(sheet.id, total);
    }
  }

  return sheets.map((sheet) => ({
    id: sheet.id,
    employee: sheet.employee,
    weekStart: toDateOnly(sheet.weekStart),
    weekEnd: addDays(toDateOnly(sheet.weekStart), 6),
    status: sheet.status,
    minutes: sheet.totalMinutes ?? liveTotals.get(sheet.id) ?? 0,
    hours: round2(minutesToHours(sheet.totalMinutes ?? liveTotals.get(sheet.id) ?? 0)),
    submittedAt: sheet.submittedAt,
    decidedBy: sheet.decidedBy,
    decisionNote: sheet.decisionNote,
  }));
}
