/**
 * Working-day arithmetic for leave.
 *
 * Pure and date-only. Everything here treats a date as a calendar day in the
 * tenant's own reckoning — never an instant — so a request never gains or loses
 * a day because the server sits in a different timezone to the office. Dates
 * cross this boundary as `YYYY-MM-DD` strings and are compared as strings.
 */

/** Saturday and Sunday. Configurable working weeks are a later problem. */
const WEEKEND = new Set([0, 6]);

export type DateOnly = string; // YYYY-MM-DD

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value: string): value is DateOnly {
  return DATE_ONLY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Parse to a UTC-midnight Date. UTC throughout keeps DST out of the maths. */
export function toUtcDate(date: DateOnly): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function toDateOnly(date: Date): DateOnly {
  return date.toISOString().slice(0, 10);
}

/** Day of week for a date-only string, 0 = Sunday. */
export function dayOfWeek(date: DateOnly): number {
  return toUtcDate(date).getUTCDay();
}

export function isWeekend(date: DateOnly): boolean {
  return WEEKEND.has(dayOfWeek(date));
}

/** Every calendar day from start to end inclusive. */
export function eachDate(start: DateOnly, end: DateOnly): DateOnly[] {
  const dates: DateOnly[] = [];
  const cursor = toUtcDate(start);
  const last = toUtcDate(end);
  while (cursor.getTime() <= last.getTime()) {
    dates.push(toDateOnly(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/** Working days in a range: excludes weekends and tenant holidays. */
export function workingDates(start: DateOnly, end: DateOnly, holidays: ReadonlySet<DateOnly>): DateOnly[] {
  return eachDate(start, end).filter((date) => !isWeekend(date) && !holidays.has(date));
}

export interface LeaveSpan {
  start: DateOnly;
  end: DateOnly;
  /** Requester takes only the afternoon of the first day. */
  startHalf?: boolean;
  /** Requester takes only the morning of the last day. */
  endHalf?: boolean;
}

/**
 * How many days a span actually costs.
 *
 * Half-day flags only ever discount a working day. Marking a half-day on a
 * Saturday or a public holiday subtracts nothing, because that day was never
 * being charged in the first place — the alternative silently hands out an
 * extra half day whenever someone brackets a weekend.
 */
export function countLeaveDays(span: LeaveSpan, holidays: ReadonlySet<DateOnly>): number {
  const working = workingDates(span.start, span.end, holidays);
  if (working.length === 0) return 0;

  // A single working day flagged on both ends is still just a half day — but a
  // flag only counts when it lands on that working day, not on a weekend the
  // span happens to reach into.
  if (working.length === 1) {
    const only = working[0];
    const halved = (span.startHalf && only === span.start) || (span.endHalf && only === span.end);
    return halved ? 0.5 : 1;
  }

  let total = working.length;
  if (span.startHalf && working[0] === span.start) total -= 0.5;
  if (span.endHalf && working[working.length - 1] === span.end) total -= 0.5;
  return total;
}

/** Do two inclusive date ranges share any day? */
export function rangesOverlap(a: { start: DateOnly; end: DateOnly }, b: { start: DateOnly; end: DateOnly }): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/** The leave year a date falls in. Calendar years for now. */
export function leaveYearOf(date: DateOnly): number {
  return Number(date.slice(0, 4));
}

/**
 * Entitlement earned by a given point in the year.
 *
 * Monthly accrual credits a twelfth per *completed* month, and a mid-year joiner
 * only earns from their start date — so someone who joins in July gets half a
 * year's allowance, not a full one.
 */
export function accruedDays(
  method: "NONE" | "ANNUAL_GRANT" | "MONTHLY_ACCRUAL",
  annualDays: number,
  year: number,
  startDate: DateOnly | null,
  asOf: DateOnly,
): number {
  if (method === "NONE" || annualDays <= 0) return 0;
  if (leaveYearOf(asOf) < year) return 0;

  // Months of the year the employee was actually employed for.
  const joinedThisYear = startDate && leaveYearOf(startDate) === year;
  const firstMonth = joinedThisYear ? Number(startDate.slice(5, 7)) : 1;
  if (startDate && leaveYearOf(startDate) > year) return 0;

  const eligibleMonths = 12 - firstMonth + 1;
  const proRated = round2((annualDays * eligibleMonths) / 12);

  if (method === "ANNUAL_GRANT") return proRated;

  // Monthly: only months already completed at `asOf` count.
  const asOfYear = leaveYearOf(asOf);
  const monthsElapsed = asOfYear > year ? 12 : Number(asOf.slice(5, 7)) - 1;
  const earnedMonths = Math.max(0, Math.min(eligibleMonths, monthsElapsed - firstMonth + 1));
  return round2((annualDays * earnedMonths) / 12);
}

/** Balances are quoted to two places; floating point is never trusted to agree. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
