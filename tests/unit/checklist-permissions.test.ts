/**
 * Checklist policy. Mostly about who may tick a task off, and making sure a
 * task assigned to someone who has since left can still be closed.
 */
import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/errors";
import {
  assertCanCompleteTask,
  assertCanReopenTask,
  can,
  canCompleteTask,
  canViewChecklist,
  type Actor,
  type ChecklistTaskTarget,
  type EmployeeTarget,
  type TaskAssigneeRole,
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

function subject(overrides: Partial<EmployeeTarget> = {}): EmployeeTarget {
  return { id: "emp_joiner", tenantId: TENANT, isSelf: false, isInDownline: false, ...overrides };
}

function task(overrides: Partial<ChecklistTaskTarget> = {}): ChecklistTaskTarget {
  return {
    tenantId: TENANT,
    subject: subject(),
    assignee: "HR",
    isAssignee: false,
    completed: false,
    ...overrides,
  };
}

const ALL_ROLES: Role[] = ["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"];

describe("checklist capabilities", () => {
  it("restricts template management to admins", () => {
    expect(can(actor("SUPER_ADMIN"), "checklist:manage")).toBe(true);
    expect(can(actor("HR_ADMIN"), "checklist:manage")).toBe(true);
    expect(can(actor("MANAGER"), "checklist:manage")).toBe(false);
    expect(can(actor("EMPLOYEE"), "checklist:manage")).toBe(false);
  });
});

describe("viewing a checklist", () => {
  it("follows the employee file rule", () => {
    expect(canViewChecklist(actor("HR_ADMIN"), subject())).toBe(true);
    expect(canViewChecklist(actor("MANAGER"), subject({ isInDownline: true }))).toBe(true);
    expect(canViewChecklist(actor("MANAGER"), subject())).toBe(false);
    expect(canViewChecklist(actor("EMPLOYEE"), subject({ isSelf: true }))).toBe(true);
    expect(canViewChecklist(actor("EMPLOYEE"), subject())).toBe(false);
  });

  it("never crosses a tenant boundary", () => {
    for (const role of ALL_ROLES) {
      expect(canViewChecklist(actor(role), subject({ tenantId: OTHER_TENANT, isSelf: true })), role).toBe(false);
    }
  });
});

describe("completing a task", () => {
  it("lets the assigned person tick it off", () => {
    for (const role of ALL_ROLES) {
      expect(canCompleteTask(actor(role), task({ isAssignee: true })), role).toBe(true);
    }
  });

  it("lets HR close anything, including tasks assigned to someone else", () => {
    expect(canCompleteTask(actor("HR_ADMIN"), task({ assignee: "MANAGER" }))).toBe(true);
    expect(canCompleteTask(actor("SUPER_ADMIN"), task({ assignee: "EMPLOYEE" }))).toBe(true);
  });

  it("lets the subject's manager pick up an unresolved manager task", () => {
    expect(
      canCompleteTask(actor("MANAGER"), task({ assignee: "MANAGER", subject: subject({ isInDownline: true }) })),
    ).toBe(true);
  });

  it("stops a manager touching a task for someone outside their downline", () => {
    expect(canCompleteTask(actor("MANAGER"), task({ assignee: "MANAGER" }))).toBe(false);
  });

  it("stops an employee closing someone else's task", () => {
    for (const assignee of ["HR", "MANAGER", "EMPLOYEE"] as TaskAssigneeRole[]) {
      expect(canCompleteTask(actor("EMPLOYEE"), task({ assignee })), assignee).toBe(false);
    }
  });

  it("will not re-complete a finished task", () => {
    expect(canCompleteTask(actor("HR_ADMIN"), task({ completed: true }))).toBe(false);
    expect(canCompleteTask(actor("EMPLOYEE"), task({ isAssignee: true, completed: true }))).toBe(false);
  });

  it("requires the task and its subject to share the actor's tenant", () => {
    expect(canCompleteTask(actor("HR_ADMIN"), task({ subject: subject({ tenantId: OTHER_TENANT }) }))).toBe(false);
    expect(canCompleteTask(actor("HR_ADMIN"), task({ tenantId: OTHER_TENANT }))).toBe(false);
  });

  it("throws from the assert form", () => {
    expect(() => assertCanCompleteTask(actor("EMPLOYEE"), task())).toThrow(ForbiddenError);
    expect(() => assertCanCompleteTask(actor("HR_ADMIN"), task())).not.toThrow();
  });
});

describe("reopening a task", () => {
  it("is admin-only, even for the person who ticked it", () => {
    expect(() => assertCanReopenTask(actor("HR_ADMIN"), task({ completed: true }))).not.toThrow();
    expect(() => assertCanReopenTask(actor("EMPLOYEE"), task({ isAssignee: true, completed: true }))).toThrow(ForbiddenError);
    expect(() => assertCanReopenTask(actor("MANAGER"), task({ completed: true }))).toThrow(ForbiddenError);
  });
});
