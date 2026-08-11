/**
 * Leave day arithmetic. These are the calculations that quietly hand out or
 * steal half days if they drift, so every edge is pinned here.
 */
import { describe, expect, it } from "vitest";
import {
  accruedDays,
  addDays,
  countLeaveDays,
  eachDate,
  formatMinutes,
  isWeekend,
  leaveYearOf,
  minutesToHours,
  rangesOverlap,
  round2,
  toDateOnly,
  weekEndOf,
  weekStartOf,
  workingDates,
} from "@/lib/modules/leave/calendar";

// 2026-08-03 is a Monday, 2026-08-08 a Saturday, 2026-08-09 a Sunday.
const NO_HOLIDAYS = new Set<string>();

describe("weekends", () => {
  it("identifies Saturday and Sunday", () => {
    expect(isWeekend("2026-08-08")).toBe(true);
    expect(isWeekend("2026-08-09")).toBe(true);
    expect(isWeekend("2026-08-07")).toBe(false);
    expect(isWeekend("2026-08-10")).toBe(false);
  });
});

describe("eachDate", () => {
  it("is inclusive at both ends", () => {
    expect(eachDate("2026-08-03", "2026-08-05")).toEqual(["2026-08-03", "2026-08-04", "2026-08-05"]);
  });

  it("handles a single day", () => {
    expect(eachDate("2026-08-03", "2026-08-03")).toEqual(["2026-08-03"]);
  });

  it("crosses a month boundary", () => {
    expect(eachDate("2026-07-30", "2026-08-02")).toEqual(["2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02"]);
  });

  it("crosses a leap day", () => {
    expect(eachDate("2028-02-28", "2028-03-01")).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
  });
});

describe("workingDates", () => {
  it("drops weekends", () => {
    expect(workingDates("2026-08-07", "2026-08-10", NO_HOLIDAYS)).toEqual(["2026-08-07", "2026-08-10"]);
  });

  it("drops tenant holidays", () => {
    expect(workingDates("2026-08-03", "2026-08-05", new Set(["2026-08-04"]))).toEqual(["2026-08-03", "2026-08-05"]);
  });
});

describe("countLeaveDays", () => {
  it("counts a plain working week as five", () => {
    expect(countLeaveDays({ start: "2026-08-03", end: "2026-08-07" }, NO_HOLIDAYS)).toBe(5);
  });

  it("ignores the weekend inside a fortnight", () => {
    expect(countLeaveDays({ start: "2026-08-03", end: "2026-08-14" }, NO_HOLIDAYS)).toBe(10);
  });

  it("subtracts a public holiday", () => {
    expect(countLeaveDays({ start: "2026-08-03", end: "2026-08-07" }, new Set(["2026-08-05"]))).toBe(4);
  });

  it("charges a single day as one", () => {
    expect(countLeaveDays({ start: "2026-08-03", end: "2026-08-03" }, NO_HOLIDAYS)).toBe(1);
  });

  it("charges a single half day as a half, however it is flagged", () => {
    expect(countLeaveDays({ start: "2026-08-03", end: "2026-08-03", startHalf: true }, NO_HOLIDAYS)).toBe(0.5);
    expect(countLeaveDays({ start: "2026-08-03", end: "2026-08-03", endHalf: true }, NO_HOLIDAYS)).toBe(0.5);
    // Both flags on one day must not double-discount into zero.
    expect(countLeaveDays({ start: "2026-08-03", end: "2026-08-03", startHalf: true, endHalf: true }, NO_HOLIDAYS)).toBe(0.5);
  });

  it("discounts each end of a multi-day span independently", () => {
    expect(countLeaveDays({ start: "2026-08-03", end: "2026-08-07", startHalf: true }, NO_HOLIDAYS)).toBe(4.5);
    expect(countLeaveDays({ start: "2026-08-03", end: "2026-08-07", endHalf: true }, NO_HOLIDAYS)).toBe(4.5);
    expect(countLeaveDays({ start: "2026-08-03", end: "2026-08-07", startHalf: true, endHalf: true }, NO_HOLIDAYS)).toBe(4);
  });

  it("returns zero for a range that is entirely weekend", () => {
    expect(countLeaveDays({ start: "2026-08-08", end: "2026-08-09" }, NO_HOLIDAYS)).toBe(0);
  });

  it("returns zero when a holiday swallows the only working day", () => {
    expect(countLeaveDays({ start: "2026-08-03", end: "2026-08-03" }, new Set(["2026-08-03"]))).toBe(0);
  });

  it("does not discount a half day that falls on a non-working day", () => {
    // Friday to Sunday with a half flag on the Sunday end. The weekend was never
    // charged, so the flag discounts nothing and Friday stays a full day.
    expect(countLeaveDays({ start: "2026-08-07", end: "2026-08-09", endHalf: true }, NO_HOLIDAYS)).toBe(1);
  });
});

describe("rangesOverlap", () => {
  it("detects a shared day", () => {
    expect(rangesOverlap({ start: "2026-08-03", end: "2026-08-07" }, { start: "2026-08-07", end: "2026-08-10" })).toBe(true);
  });

  it("treats adjacent ranges as clear", () => {
    expect(rangesOverlap({ start: "2026-08-03", end: "2026-08-06" }, { start: "2026-08-07", end: "2026-08-10" })).toBe(false);
  });

  it("detects full containment", () => {
    expect(rangesOverlap({ start: "2026-08-03", end: "2026-08-21" }, { start: "2026-08-10", end: "2026-08-12" })).toBe(true);
  });
});

describe("accruedDays", () => {
  it("grants nothing when the method is NONE", () => {
    expect(accruedDays("NONE", 25, 2026, "2020-01-01", "2026-08-10")).toBe(0);
  });

  it("grants the full allowance up front for an existing employee", () => {
    expect(accruedDays("ANNUAL_GRANT", 25, 2026, "2020-01-01", "2026-01-05")).toBe(25);
  });

  it("pro-rates an annual grant for a mid-year joiner", () => {
    // Joins in July: six eligible months of twelve.
    expect(accruedDays("ANNUAL_GRANT", 24, 2026, "2026-07-15", "2026-08-10")).toBe(12);
  });

  it("accrues a twelfth per completed month", () => {
    // As of 1 August, seven months (Jan-Jul) are complete.
    expect(accruedDays("MONTHLY_ACCRUAL", 24, 2026, "2020-01-01", "2026-08-01")).toBe(14);
  });

  it("accrues nothing in the first month of employment", () => {
    expect(accruedDays("MONTHLY_ACCRUAL", 24, 2026, "2026-08-01", "2026-08-20")).toBe(0);
  });

  it("gives a full year once the year is past", () => {
    expect(accruedDays("MONTHLY_ACCRUAL", 24, 2026, "2020-01-01", "2027-03-01")).toBe(24);
  });

  it("grants nothing for a year before the employee joined", () => {
    expect(accruedDays("ANNUAL_GRANT", 25, 2025, "2026-02-01", "2026-08-10")).toBe(0);
  });

  it("grants nothing for a year that has not started", () => {
    expect(accruedDays("ANNUAL_GRANT", 25, 2027, "2020-01-01", "2026-08-10")).toBe(0);
  });
});

describe("helpers", () => {
  it("derives the leave year from the date", () => {
    expect(leaveYearOf("2026-08-10")).toBe(2026);
  });

  it("rounds to two places without floating point noise", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1 / 3)).toBe(0.33);
  });

  it("formats a Date back to a date-only string", () => {
    expect(toDateOnly(new Date("2026-08-10T22:30:00.000Z"))).toBe("2026-08-10");
  });
});

describe("weeks", () => {
  // 2026-08-10 is a Monday, 2026-08-16 the Sunday closing that week.
  it("anchors a week to its Monday", () => {
    expect(weekStartOf("2026-08-10")).toBe("2026-08-10"); // Monday itself
    expect(weekStartOf("2026-08-13")).toBe("2026-08-10"); // Thursday
    expect(weekStartOf("2026-08-15")).toBe("2026-08-10"); // Saturday
  });

  it("keeps Sunday in the week that already began", () => {
    // The classic off-by-one: Sunday must not start a new week.
    expect(weekStartOf("2026-08-16")).toBe("2026-08-10");
    expect(weekStartOf("2026-08-17")).toBe("2026-08-17"); // the next Monday
  });

  it("closes a week on the Sunday", () => {
    expect(weekEndOf("2026-08-13")).toBe("2026-08-16");
    expect(weekEndOf("2026-08-16")).toBe("2026-08-16");
  });

  it("spans a month boundary", () => {
    expect(weekStartOf("2026-09-01")).toBe("2026-08-31");
  });

  it("shifts by whole days in both directions", () => {
    expect(addDays("2026-08-10", 7)).toBe("2026-08-17");
    expect(addDays("2026-08-10", -1)).toBe("2026-08-09");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("minutes", () => {
  it("formats as hours and minutes", () => {
    expect(formatMinutes(450)).toBe("7h 30m");
    expect(formatMinutes(480)).toBe("8h");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(0)).toBe("0m");
  });

  it("keeps a negative balance readable", () => {
    expect(formatMinutes(-90)).toBe("-1h 30m");
  });

  it("converts to hours for totals", () => {
    expect(minutesToHours(450)).toBe(7.5);
    expect(minutesToHours(100)).toBe(1.67);
  });
});
