/**
 * Timesheet policy. The rules worth pinning: a manager cannot write hours they
 * would then approve, an approved week is closed to everyone, and nobody signs
 * off their own time.
 */
import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/errors";
import {
  assertCanDecideTimesheet,
  assertCanEditTimeEntry,
  can,
  canDecideTimesheet,
  canEditTimeEntry,
  canRecordTimeFor,
  canSubmitTimesheet,
  canViewTimesheet,
  type Actor,
  type EmployeeTarget,
  type TimesheetStatusValue,
  type TimesheetTarget,
} from "@/lib/permissions";
import type { Role } from "@/generated/prisma/enums";

const TENANT = "tenant_acme";
const OTHER_TENANT = "tenant_globex";

function actor(role: Role, overrides: Partial<Actor> = {}): Actor {
  return {
    userId: `user_${role.toLowerCase()}`,
    tenantId: TENANT,
    role,
    employeeId: `emp_${role.toLowerCase()}`,
    email: `${role.toLowerCase()}@acme.test`,
    ...overrides,
  };
}

function target(overrides: Partial<EmployeeTarget> = {}): EmployeeTarget {
  return { id: "emp_other", tenantId: TENANT, isSelf: false, isInDownline: false, ...overrides };
}

function sheet(employee: EmployeeTarget, status: TimesheetStatusValue = "OPEN"): TimesheetTarget {
  return { tenantId: employee.tenantId, employee, status };
}

const ALL_ROLES: Role[] = ["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"];
const ALL_STATUSES: TimesheetStatusValue[] = ["OPEN", "SUBMITTED", "APPROVED", "REJECTED"];

describe("time capabilities", () => {
  it("lets every role track their own time", () => {
    for (const role of ALL_ROLES) {
      expect(can(actor(role), "time:track"), role).toBe(true);
    }
  });

  it("restricts time administration to admins", () => {
    expect(can(actor("SUPER_ADMIN"), "time:manage")).toBe(true);
    expect(can(actor("HR_ADMIN"), "time:manage")).toBe(true);
    expect(can(actor("MANAGER"), "time:manage")).toBe(false);
    expect(can(actor("EMPLOYEE"), "time:manage")).toBe(false);
  });
});

describe("viewing hours", () => {
  it("lets anyone see their own", () => {
    for (const role of ALL_ROLES) {
      expect(canViewTimesheet(actor(role), target({ isSelf: true })), role).toBe(true);
    }
  });

  it("lets a manager see a report's, but not a peer's", () => {
    expect(canViewTimesheet(actor("MANAGER"), target({ isInDownline: true }))).toBe(true);
    expect(canViewTimesheet(actor("MANAGER"), target())).toBe(false);
  });

  it("hides a colleague's from an employee", () => {
    expect(canViewTimesheet(actor("EMPLOYEE"), target())).toBe(false);
  });

  it("never crosses a tenant boundary", () => {
    for (const role of ALL_ROLES) {
      expect(canViewTimesheet(actor(role), target({ tenantId: OTHER_TENANT, isSelf: true })), role).toBe(false);
    }
  });
});

describe("recording hours", () => {
  it("is self-service for every role", () => {
    for (const role of ALL_ROLES) {
      expect(canRecordTimeFor(actor(role), target({ isSelf: true })), role).toBe(true);
    }
  });

  it("lets HR record on someone's behalf", () => {
    expect(canRecordTimeFor(actor("HR_ADMIN"), target())).toBe(true);
  });

  it("stops a manager writing hours for a report", () => {
    // Otherwise a manager could author the very week they later sign off.
    expect(canRecordTimeFor(actor("MANAGER"), target({ isInDownline: true }))).toBe(false);
  });

  it("never crosses a tenant boundary", () => {
    expect(canRecordTimeFor(actor("HR_ADMIN"), target({ tenantId: OTHER_TENANT }))).toBe(false);
  });
});

describe("editing entries", () => {
  it("is open while the week is open or sent back", () => {
    for (const status of ["OPEN", "REJECTED"] as TimesheetStatusValue[]) {
      expect(canEditTimeEntry(actor("EMPLOYEE"), sheet(target({ isSelf: true }), status)), status).toBe(true);
    }
  });

  it("locks a submitted week for the owner but not for HR", () => {
    expect(canEditTimeEntry(actor("EMPLOYEE"), sheet(target({ isSelf: true }), "SUBMITTED"))).toBe(false);
    expect(canEditTimeEntry(actor("HR_ADMIN"), sheet(target(), "SUBMITTED"))).toBe(true);
  });

  it("closes an approved week to everyone, including HR", () => {
    for (const role of ALL_ROLES) {
      expect(canEditTimeEntry(actor(role), sheet(target({ isSelf: true }), "APPROVED")), role).toBe(false);
    }
    expect(canEditTimeEntry(actor("HR_ADMIN"), sheet(target(), "APPROVED"))).toBe(false);
  });

  it("throws from the assert form", () => {
    expect(() => assertCanEditTimeEntry(actor("EMPLOYEE"), sheet(target({ isSelf: true }), "APPROVED"))).toThrow(ForbiddenError);
  });
});

describe("submitting a week", () => {
  it("works from open or rejected", () => {
    expect(canSubmitTimesheet(actor("EMPLOYEE"), sheet(target({ isSelf: true }), "OPEN"))).toBe(true);
    expect(canSubmitTimesheet(actor("EMPLOYEE"), sheet(target({ isSelf: true }), "REJECTED"))).toBe(true);
  });

  it("is not repeatable once submitted or approved", () => {
    for (const status of ["SUBMITTED", "APPROVED"] as TimesheetStatusValue[]) {
      expect(canSubmitTimesheet(actor("EMPLOYEE"), sheet(target({ isSelf: true }), status)), status).toBe(false);
    }
  });

  it("is not something a manager does for a report", () => {
    expect(canSubmitTimesheet(actor("MANAGER"), sheet(target({ isInDownline: true }), "OPEN"))).toBe(false);
  });
});

describe("deciding a week", () => {
  it("lets a manager decide for their downline", () => {
    expect(canDecideTimesheet(actor("MANAGER"), sheet(target({ isInDownline: true }), "SUBMITTED"))).toBe(true);
  });

  it("stops a manager deciding outside their downline", () => {
    expect(canDecideTimesheet(actor("MANAGER"), sheet(target(), "SUBMITTED"))).toBe(false);
  });

  it("lets admins decide for anyone", () => {
    expect(canDecideTimesheet(actor("HR_ADMIN"), sheet(target(), "SUBMITTED"))).toBe(true);
    expect(canDecideTimesheet(actor("SUPER_ADMIN"), sheet(target(), "SUBMITTED"))).toBe(true);
  });

  it("stops every role signing off their own week", () => {
    for (const role of ALL_ROLES) {
      expect(canDecideTimesheet(actor(role), sheet(target({ isSelf: true }), "SUBMITTED")), role).toBe(false);
    }
  });

  it("only acts on a submitted week", () => {
    for (const status of ["OPEN", "APPROVED", "REJECTED"] as TimesheetStatusValue[]) {
      expect(canDecideTimesheet(actor("HR_ADMIN"), sheet(target(), status)), status).toBe(false);
    }
  });

  it("stops an employee deciding at all", () => {
    for (const status of ALL_STATUSES) {
      expect(canDecideTimesheet(actor("EMPLOYEE"), sheet(target(), status)), status).toBe(false);
    }
  });

  it("requires the sheet and its employee to share the actor's tenant", () => {
    const foreign = target({ tenantId: OTHER_TENANT, isInDownline: true });
    expect(canDecideTimesheet(actor("HR_ADMIN"), { tenantId: TENANT, employee: foreign, status: "SUBMITTED" })).toBe(false);
    expect(() => assertCanDecideTimesheet(actor("HR_ADMIN"), { tenantId: TENANT, employee: foreign, status: "SUBMITTED" })).toThrow(
      ForbiddenError,
    );
  });
});
