/**
 * Exhaustive tests for the permission policy (spec §5.3: "unit tests on the
 * permission layer"). These cover every role against every kind of target,
 * including the cross-tenant case, which is the one that must never regress.
 */
import { describe, expect, it } from "vitest";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import {
  SELF_EDITABLE_EMPLOYEE_FIELDS,
  assertAuthenticated,
  assertCan,
  assertCanEditEmployee,
  assertCanManageDocuments,
  assertCanReadDocuments,
  assertCanViewFullEmployee,
  assertSameTenant,
  can,
  employeeEditLevel,
  employeeViewLevel,
  isAdmin,
  restrictToSelfEditableFields,
  type Actor,
  type EmployeeTarget,
  type Permission,
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

const ALL_ROLES: Role[] = ["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"];

describe("role capabilities", () => {
  it("grants administrative permissions to admin roles only", () => {
    const adminOnly: Permission[] = [
      "employee:create",
      "employee:delete",
      "department:manage",
      "settings:manage",
      "invite:manage",
      "audit:read",
      "document:manage_categories",
    ];

    for (const permission of adminOnly) {
      expect(can(actor("SUPER_ADMIN"), permission), `SUPER_ADMIN ${permission}`).toBe(true);
      expect(can(actor("HR_ADMIN"), permission), `HR_ADMIN ${permission}`).toBe(true);
      expect(can(actor("MANAGER"), permission), `MANAGER ${permission}`).toBe(false);
      expect(can(actor("EMPLOYEE"), permission), `EMPLOYEE ${permission}`).toBe(false);
    }
  });

  it("lets every role read the directory", () => {
    for (const role of ALL_ROLES) {
      expect(can(actor(role), "directory:read")).toBe(true);
    }
  });

  it("identifies admin roles", () => {
    expect(isAdmin("HR_ADMIN")).toBe(true);
    expect(isAdmin("SUPER_ADMIN")).toBe(true);
    expect(isAdmin("MANAGER")).toBe(false);
    expect(isAdmin("EMPLOYEE")).toBe(false);
  });

  it("throws ForbiddenError when a capability is missing", () => {
    expect(() => assertCan(actor("EMPLOYEE"), "settings:manage")).toThrow(ForbiddenError);
    expect(() => assertCan(actor("HR_ADMIN"), "settings:manage")).not.toThrow();
  });

  it("requires an actor to be present", () => {
    expect(() => assertAuthenticated(null)).toThrow(UnauthorizedError);
    expect(() => assertAuthenticated(actor("EMPLOYEE"))).not.toThrow();
  });
});

describe("tenant isolation", () => {
  it("rejects any access to another tenant's record", () => {
    for (const role of ALL_ROLES) {
      expect(() => assertSameTenant(actor(role), OTHER_TENANT), role).toThrow(ForbiddenError);
      expect(() => assertSameTenant(actor(role), TENANT), role).not.toThrow();
    }
  });

  it("denies visibility of a cross-tenant employee even to an admin", () => {
    const foreign = target({ tenantId: OTHER_TENANT });
    for (const role of ALL_ROLES) {
      expect(employeeViewLevel(actor(role), foreign), role).toBe("none");
      expect(employeeEditLevel(actor(role), foreign), role).toBe("none");
    }
  });

  it("ignores isSelf/isInDownline claims that cross a tenant boundary", () => {
    // Defence in depth: even if a caller mis-computed the context, the tenant
    // check runs first.
    const spoofed = target({ tenantId: OTHER_TENANT, isSelf: true, isInDownline: true });
    expect(employeeViewLevel(actor("HR_ADMIN"), spoofed)).toBe("none");
    expect(employeeEditLevel(actor("MANAGER"), spoofed)).toBe("none");
  });
});

describe("employee visibility", () => {
  it("gives HR full visibility of everyone in the tenant", () => {
    expect(employeeViewLevel(actor("HR_ADMIN"), target())).toBe("full");
    expect(employeeViewLevel(actor("SUPER_ADMIN"), target())).toBe("full");
  });

  it("gives a manager full visibility of their downline only", () => {
    expect(employeeViewLevel(actor("MANAGER"), target({ isInDownline: true }))).toBe("full");
    expect(employeeViewLevel(actor("MANAGER"), target({ isInDownline: false }))).toBe("directory");
  });

  it("gives an employee full visibility of themselves and directory-level of colleagues", () => {
    expect(employeeViewLevel(actor("EMPLOYEE"), target({ isSelf: true }))).toBe("full");
    expect(employeeViewLevel(actor("EMPLOYEE"), target())).toBe("directory");
  });

  it("does not grant a non-manager full access just because a downline flag is set", () => {
    // An EMPLOYEE has no reports; a stray flag must not upgrade their access.
    expect(employeeViewLevel(actor("EMPLOYEE"), target({ isInDownline: true }))).toBe("directory");
  });

  it("blocks the full-profile assertion at directory level", () => {
    expect(() => assertCanViewFullEmployee(actor("EMPLOYEE"), target())).toThrow(ForbiddenError);
    expect(() => assertCanViewFullEmployee(actor("EMPLOYEE"), target({ isSelf: true }))).not.toThrow();
    expect(() => assertCanViewFullEmployee(actor("MANAGER"), target({ isInDownline: true }))).not.toThrow();
    expect(() => assertCanViewFullEmployee(actor("MANAGER"), target())).toThrow(ForbiddenError);
  });
});

describe("employee editing", () => {
  it("lets HR edit anyone fully", () => {
    expect(employeeEditLevel(actor("HR_ADMIN"), target())).toBe("full");
    expect(employeeEditLevel(actor("SUPER_ADMIN"), target())).toBe("full");
  });

  it("limits everyone else to their own record", () => {
    expect(employeeEditLevel(actor("EMPLOYEE"), target({ isSelf: true }))).toBe("self");
    expect(employeeEditLevel(actor("MANAGER"), target({ isSelf: true }))).toBe("self");
  });

  it("does not let a manager edit their reports", () => {
    // Managers can see their reports' data but changing it is an HR action.
    expect(employeeEditLevel(actor("MANAGER"), target({ isInDownline: true }))).toBe("none");
    expect(() => assertCanEditEmployee(actor("MANAGER"), target({ isInDownline: true }))).toThrow(ForbiddenError);
  });

  it("does not let an employee edit a colleague", () => {
    expect(employeeEditLevel(actor("EMPLOYEE"), target())).toBe("none");
    expect(() => assertCanEditEmployee(actor("EMPLOYEE"), target())).toThrow(ForbiddenError);
  });
});

describe("self-service field restriction", () => {
  it("accepts the allow-listed fields", () => {
    const payload = { phone: "+1 555 0100", personalEmail: "me@home.test", bio: "Hello" };
    expect(restrictToSelfEditableFields(payload)).toEqual(payload);
  });

  it("rejects privilege-relevant fields", () => {
    for (const field of ["jobTitle", "managerId", "departmentId", "status", "startDate", "workEmail"]) {
      expect(() => restrictToSelfEditableFields({ [field]: "x" }), field).toThrow(ForbiddenError);
    }
  });

  it("rejects a payload that mixes an allowed field with a forbidden one", () => {
    expect(() => restrictToSelfEditableFields({ phone: "+1 555 0100", status: "TERMINATED" })).toThrow(ForbiddenError);
  });

  it("keeps the allow-list free of anything privilege-bearing", () => {
    const forbidden = ["status", "managerId", "departmentId", "employmentTypeId", "workEmail", "startDate", "endDate"];
    for (const field of forbidden) {
      expect(SELF_EDITABLE_EMPLOYEE_FIELDS).not.toContain(field);
    }
  });
});

describe("document access", () => {
  it("ties document reads to full profile visibility", () => {
    expect(() => assertCanReadDocuments(actor("EMPLOYEE"), target({ isSelf: true }))).not.toThrow();
    expect(() => assertCanReadDocuments(actor("EMPLOYEE"), target())).toThrow(ForbiddenError);
    expect(() => assertCanReadDocuments(actor("MANAGER"), target({ isInDownline: true }))).not.toThrow();
    expect(() => assertCanReadDocuments(actor("MANAGER"), target())).toThrow(ForbiddenError);
    expect(() => assertCanReadDocuments(actor("HR_ADMIN"), target())).not.toThrow();
  });

  it("restricts uploading and deleting to HR, even on one's own record", () => {
    expect(() => assertCanManageDocuments(actor("HR_ADMIN"), target())).not.toThrow();
    expect(() => assertCanManageDocuments(actor("SUPER_ADMIN"), target())).not.toThrow();
    expect(() => assertCanManageDocuments(actor("EMPLOYEE"), target({ isSelf: true }))).toThrow(ForbiddenError);
    expect(() => assertCanManageDocuments(actor("MANAGER"), target({ isInDownline: true }))).toThrow(ForbiddenError);
  });

  it("refuses document management across tenants", () => {
    expect(() => assertCanManageDocuments(actor("HR_ADMIN"), target({ tenantId: OTHER_TENANT }))).toThrow(ForbiddenError);
  });
});

describe("actor without an employee record", () => {
  it("treats a login with no linked employee as nobody's self", () => {
    // e.g. a platform administrator who is not on the payroll.
    const platformAdmin = actor("SUPER_ADMIN", { employeeId: null });
    expect(employeeViewLevel(platformAdmin, target())).toBe("full");

    const orphanEmployee = actor("EMPLOYEE", { employeeId: null });
    expect(employeeViewLevel(orphanEmployee, target())).toBe("directory");
    expect(employeeEditLevel(orphanEmployee, target())).toBe("none");
  });
});
