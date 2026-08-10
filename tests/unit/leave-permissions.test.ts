/**
 * Leave policy. The rules that matter most here are the ones that stop someone
 * approving their own time off and stop a manager reading a colleague's reason
 * for being away.
 */
import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/errors";
import {
  assertCanAdjustBalance,
  assertCanDecideLeave,
  can,
  canCancelLeave,
  canDecideLeave,
  canRequestLeaveFor,
  canViewLeave,
  type Actor,
  type EmployeeTarget,
  type LeaveRequestTarget,
  type LeaveStatus,
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

function request(employee: EmployeeTarget, status: LeaveStatus = "PENDING"): LeaveRequestTarget {
  return { tenantId: employee.tenantId, employee, status };
}

const ALL_ROLES: Role[] = ["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"];

describe("leave capabilities", () => {
  it("lets every role book their own leave", () => {
    for (const role of ALL_ROLES) {
      expect(can(actor(role), "leave:request"), role).toBe(true);
    }
  });

  it("restricts administration of leave to admins", () => {
    for (const permission of ["leave:manage", "leave:configure"] as const) {
      expect(can(actor("SUPER_ADMIN"), permission)).toBe(true);
      expect(can(actor("HR_ADMIN"), permission)).toBe(true);
      expect(can(actor("MANAGER"), permission)).toBe(false);
      expect(can(actor("EMPLOYEE"), permission)).toBe(false);
    }
  });
});

describe("viewing leave", () => {
  it("lets anyone see their own", () => {
    for (const role of ALL_ROLES) {
      expect(canViewLeave(actor(role), target({ isSelf: true })), role).toBe(true);
    }
  });

  it("lets a manager see a report's", () => {
    expect(canViewLeave(actor("MANAGER"), target({ isInDownline: true }))).toBe(true);
  });

  it("hides a colleague's from a peer", () => {
    expect(canViewLeave(actor("EMPLOYEE"), target())).toBe(false);
    expect(canViewLeave(actor("MANAGER"), target())).toBe(false);
  });

  it("lets admins see anyone's", () => {
    expect(canViewLeave(actor("HR_ADMIN"), target())).toBe(true);
    expect(canViewLeave(actor("SUPER_ADMIN"), target())).toBe(true);
  });

  it("never crosses a tenant boundary", () => {
    for (const role of ALL_ROLES) {
      const foreign = target({ tenantId: OTHER_TENANT, isSelf: true, isInDownline: true });
      expect(canViewLeave(actor(role), foreign), role).toBe(false);
    }
  });
});

describe("booking leave", () => {
  it("is self-service for every role", () => {
    for (const role of ALL_ROLES) {
      expect(canRequestLeaveFor(actor(role), target({ isSelf: true })), role).toBe(true);
    }
  });

  it("lets HR file on someone's behalf", () => {
    expect(canRequestLeaveFor(actor("HR_ADMIN"), target())).toBe(true);
  });

  it("stops a manager booking leave for a report", () => {
    expect(canRequestLeaveFor(actor("MANAGER"), target({ isInDownline: true }))).toBe(false);
  });

  it("stops an employee booking leave for anyone else", () => {
    expect(canRequestLeaveFor(actor("EMPLOYEE"), target())).toBe(false);
  });

  it("never crosses a tenant boundary", () => {
    expect(canRequestLeaveFor(actor("HR_ADMIN"), target({ tenantId: OTHER_TENANT }))).toBe(false);
  });
});

describe("deciding leave", () => {
  it("lets a manager decide for their downline", () => {
    expect(canDecideLeave(actor("MANAGER"), request(target({ isInDownline: true })))).toBe(true);
  });

  it("stops a manager deciding for someone outside their downline", () => {
    expect(canDecideLeave(actor("MANAGER"), request(target()))).toBe(false);
  });

  it("lets admins decide for anyone", () => {
    expect(canDecideLeave(actor("HR_ADMIN"), request(target()))).toBe(true);
    expect(canDecideLeave(actor("SUPER_ADMIN"), request(target()))).toBe(true);
  });

  it("stops every role approving their own request", () => {
    for (const role of ALL_ROLES) {
      expect(canDecideLeave(actor(role), request(target({ isSelf: true }))), role).toBe(false);
    }
  });

  it("stops an employee deciding at all", () => {
    expect(canDecideLeave(actor("EMPLOYEE"), request(target()))).toBe(false);
  });

  it("only acts on a pending request", () => {
    for (const status of ["APPROVED", "REJECTED", "CANCELLED"] as LeaveStatus[]) {
      expect(canDecideLeave(actor("HR_ADMIN"), request(target(), status)), status).toBe(false);
    }
  });

  it("never crosses a tenant boundary", () => {
    const foreign = target({ tenantId: OTHER_TENANT, isInDownline: true });
    expect(canDecideLeave(actor("HR_ADMIN", { tenantId: TENANT }), { ...request(foreign), tenantId: TENANT })).toBe(false);
  });

  it("throws a ForbiddenError from the assert form", () => {
    expect(() => assertCanDecideLeave(actor("EMPLOYEE"), request(target()))).toThrow(ForbiddenError);
    expect(() => assertCanDecideLeave(actor("HR_ADMIN"), request(target()))).not.toThrow();
  });
});

describe("cancelling leave", () => {
  it("lets the requester withdraw while pending or approved", () => {
    for (const status of ["PENDING", "APPROVED"] as LeaveStatus[]) {
      expect(canCancelLeave(actor("EMPLOYEE"), request(target({ isSelf: true }), status)), status).toBe(true);
    }
  });

  it("treats rejected and cancelled as terminal", () => {
    for (const status of ["REJECTED", "CANCELLED"] as LeaveStatus[]) {
      expect(canCancelLeave(actor("HR_ADMIN"), request(target(), status)), status).toBe(false);
    }
  });

  it("lets HR cancel anyone's", () => {
    expect(canCancelLeave(actor("HR_ADMIN"), request(target()))).toBe(true);
  });

  it("stops a manager cancelling a report's booking", () => {
    // Managers reject; they do not withdraw on someone's behalf.
    expect(canCancelLeave(actor("MANAGER"), request(target({ isInDownline: true })))).toBe(false);
  });
});

describe("balance adjustments", () => {
  it("is admin-only", () => {
    expect(() => assertCanAdjustBalance(actor("HR_ADMIN"), target())).not.toThrow();
    expect(() => assertCanAdjustBalance(actor("SUPER_ADMIN"), target())).not.toThrow();
    expect(() => assertCanAdjustBalance(actor("MANAGER"), target({ isInDownline: true }))).toThrow(ForbiddenError);
    expect(() => assertCanAdjustBalance(actor("EMPLOYEE"), target({ isSelf: true }))).toThrow(ForbiddenError);
  });

  it("never crosses a tenant boundary", () => {
    expect(() => assertCanAdjustBalance(actor("HR_ADMIN"), target({ tenantId: OTHER_TENANT }))).toThrow(ForbiddenError);
  });
});
