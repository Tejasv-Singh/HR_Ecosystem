/**
 * Recruitment policy. Candidate data is not directory-visible, a hiring manager
 * is scoped to their own postings, and only HR closes the loop by hiring.
 */
import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/errors";
import {
  APPLICATION_STAGES,
  assertCanManagePostings,
  assertCanMoveApplication,
  can,
  canMoveApplication,
  canViewPosting,
  isValidStageTransition,
  type Actor,
  type ApplicationStageValue,
  type PostingTarget,
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

function posting(overrides: Partial<PostingTarget> = {}): PostingTarget {
  return { tenantId: TENANT, isHiringManager: false, ...overrides };
}

const ALL_ROLES: Role[] = ["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"];

describe("recruiting capabilities", () => {
  it("gives managers read access but not management", () => {
    expect(can(actor("MANAGER"), "recruiting:read")).toBe(true);
    expect(can(actor("MANAGER"), "recruiting:manage")).toBe(false);
  });

  it("keeps recruitment away from ordinary employees entirely", () => {
    expect(can(actor("EMPLOYEE"), "recruiting:read")).toBe(false);
    expect(can(actor("EMPLOYEE"), "recruiting:manage")).toBe(false);
  });

  it("gives admins both", () => {
    for (const role of ["SUPER_ADMIN", "HR_ADMIN"] as Role[]) {
      expect(can(actor(role), "recruiting:read"), role).toBe(true);
      expect(can(actor(role), "recruiting:manage"), role).toBe(true);
    }
  });
});

describe("viewing a posting", () => {
  it("lets admins see every posting", () => {
    expect(canViewPosting(actor("HR_ADMIN"), posting())).toBe(true);
    expect(canViewPosting(actor("SUPER_ADMIN"), posting())).toBe(true);
  });

  it("scopes a manager to postings they are hiring for", () => {
    expect(canViewPosting(actor("MANAGER"), posting({ isHiringManager: true }))).toBe(true);
    expect(canViewPosting(actor("MANAGER"), posting())).toBe(false);
  });

  it("hides recruitment from employees, even their own team's roles", () => {
    expect(canViewPosting(actor("EMPLOYEE"), posting({ isHiringManager: true }))).toBe(false);
  });

  it("never crosses a tenant boundary", () => {
    for (const role of ALL_ROLES) {
      expect(canViewPosting(actor(role), posting({ tenantId: OTHER_TENANT, isHiringManager: true })), role).toBe(false);
    }
  });
});

describe("moving an application", () => {
  it("lets a hiring manager advance their own pipeline", () => {
    for (const stage of ["SCREENING", "INTERVIEW", "OFFER", "REJECTED"] as ApplicationStageValue[]) {
      expect(canMoveApplication(actor("MANAGER"), posting({ isHiringManager: true }), stage), stage).toBe(true);
    }
  });

  it("reserves the actual hire for HR", () => {
    expect(canMoveApplication(actor("MANAGER"), posting({ isHiringManager: true }), "HIRED")).toBe(false);
    expect(canMoveApplication(actor("HR_ADMIN"), posting(), "HIRED")).toBe(true);
    expect(canMoveApplication(actor("SUPER_ADMIN"), posting(), "HIRED")).toBe(true);
  });

  it("stops a manager touching someone else's pipeline", () => {
    expect(canMoveApplication(actor("MANAGER"), posting(), "SCREENING")).toBe(false);
  });

  it("stops an employee entirely", () => {
    expect(canMoveApplication(actor("EMPLOYEE"), posting({ isHiringManager: true }), "SCREENING")).toBe(false);
  });

  it("throws from the assert form", () => {
    expect(() => assertCanMoveApplication(actor("MANAGER"), posting({ isHiringManager: true }), "HIRED")).toThrow(ForbiddenError);
    expect(() => assertCanMoveApplication(actor("HR_ADMIN"), posting(), "HIRED")).not.toThrow();
  });
});

describe("managing postings", () => {
  it("is HR only", () => {
    expect(() => assertCanManagePostings(actor("HR_ADMIN"))).not.toThrow();
    expect(() => assertCanManagePostings(actor("MANAGER"))).toThrow(ForbiddenError);
    expect(() => assertCanManagePostings(actor("EMPLOYEE"))).toThrow(ForbiddenError);
  });
});

describe("stage transitions", () => {
  it("treats hired and rejected as terminal", () => {
    for (const to of [...APPLICATION_STAGES, "REJECTED"] as ApplicationStageValue[]) {
      expect(isValidStageTransition("HIRED", to), `HIRED->${to}`).toBe(false);
      expect(isValidStageTransition("REJECTED", to), `REJECTED->${to}`).toBe(false);
    }
  });

  it("allows rejection from any live stage", () => {
    for (const from of APPLICATION_STAGES) {
      if (from === "HIRED") continue;
      expect(isValidStageTransition(from, "REJECTED"), from).toBe(true);
    }
  });

  it("allows moving forwards and back within the pipeline", () => {
    expect(isValidStageTransition("APPLIED", "SCREENING")).toBe(true);
    expect(isValidStageTransition("SCREENING", "OFFER")).toBe(true);
    expect(isValidStageTransition("OFFER", "SCREENING")).toBe(true);
  });

  it("refuses a no-op and a return to APPLIED", () => {
    expect(isValidStageTransition("SCREENING", "SCREENING")).toBe(false);
    expect(isValidStageTransition("SCREENING", "APPLIED")).toBe(false);
  });
});
