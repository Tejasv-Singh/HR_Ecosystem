/**
 * The permission policy layer.
 *
 * Everything here is a pure function of (actor, target). No database access, no
 * request objects — which is what makes it exhaustively unit-testable. Services
 * are responsible for loading the small amount of relational context each
 * decision needs (is this me? is this person in my reporting line?) and passing
 * it in.
 *
 * Rules of the road:
 *   - `SUPER_ADMIN` is platform-level and still acts inside a single tenant per
 *     session; it never gets to read across tenants implicitly.
 *   - Cross-tenant access is not a permission question at all. It is denied
 *     before any policy below is consulted (`assertSameTenant`).
 */
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import type { Role } from "@/generated/prisma/enums";

export interface Actor {
  userId: string;
  tenantId: string;
  role: Role;
  /** The Employee record this login belongs to, if any. */
  employeeId: string | null;
  email: string;
}

/** Relational facts about a target employee, relative to the actor. */
export interface EmployeeTarget {
  id: string;
  tenantId: string;
  /** True when the target *is* the actor's own employee record. */
  isSelf: boolean;
  /** True when the actor is this employee's manager, directly or transitively. */
  isInDownline: boolean;
}

/** Coarse-grained capabilities that do not depend on a specific record. */
export type Permission =
  | "employee:create"
  | "employee:delete"
  | "department:manage"
  | "settings:manage"
  | "invite:manage"
  | "audit:read"
  | "document:manage_categories"
  | "directory:read"
  | "leave:request"
  | "leave:manage"
  | "leave:configure"
  | "time:track"
  | "time:manage";

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: [
    "employee:create",
    "employee:delete",
    "department:manage",
    "settings:manage",
    "invite:manage",
    "audit:read",
    "document:manage_categories",
    "directory:read",
    "leave:request",
    "leave:manage",
    "leave:configure",
    "time:track",
    "time:manage",
  ],
  HR_ADMIN: [
    "employee:create",
    "employee:delete",
    "department:manage",
    "settings:manage",
    "invite:manage",
    "audit:read",
    "document:manage_categories",
    "directory:read",
    "leave:request",
    "leave:manage",
    "leave:configure",
    "time:track",
    "time:manage",
  ],
  MANAGER: ["directory:read", "leave:request", "time:track"],
  EMPLOYEE: ["directory:read", "leave:request", "time:track"],
};

/** How much of an employee record the actor may see. */
export type ViewLevel = "none" | "directory" | "full";

/** How much of an employee record the actor may change. */
export type EditLevel = "none" | "self" | "full";

/**
 * Fields an employee is trusted to maintain on their own record. Notably absent:
 * jobTitle, department, manager, employment type, status and dates — changing
 * those is an HR action, not self-service.
 */
export const SELF_EDITABLE_EMPLOYEE_FIELDS = [
  "preferredName",
  "personalEmail",
  "phone",
  "address",
  "dateOfBirth",
  "bio",
] as const;

export type SelfEditableEmployeeField = (typeof SELF_EDITABLE_EMPLOYEE_FIELDS)[number];

/**
 * Employee fields that everyone in the tenant may see. This is the "directory"
 * projection — a company phone book, not a personnel file.
 */
export const DIRECTORY_EMPLOYEE_FIELDS = [
  "id",
  "firstName",
  "lastName",
  "preferredName",
  "workEmail",
  "jobTitle",
  "departmentId",
  "managerId",
  "location",
  "status",
] as const;

export function isAdmin(role: Role): boolean {
  return role === "HR_ADMIN" || role === "SUPER_ADMIN";
}

export function can(actor: Actor, permission: Permission): boolean {
  return ROLE_PERMISSIONS[actor.role].includes(permission);
}

export function assertCan(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) {
    throw new ForbiddenError(`Your role (${actor.role}) cannot perform this action.`);
  }
}

export function assertAuthenticated(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor) throw new UnauthorizedError();
}

/**
 * The single chokepoint for tenant isolation. Called by every service function
 * that touches a tenant-owned record.
 */
export function assertSameTenant(actor: Actor, resourceTenantId: string): void {
  if (actor.tenantId !== resourceTenantId) {
    // Deliberately the same error a permission failure produces.
    throw new ForbiddenError();
  }
}

export function employeeViewLevel(actor: Actor, target: EmployeeTarget): ViewLevel {
  if (actor.tenantId !== target.tenantId) return "none";
  if (isAdmin(actor.role)) return "full";
  if (target.isSelf) return "full";
  if (actor.role === "MANAGER" && target.isInDownline) return "full";
  return "directory";
}

export function employeeEditLevel(actor: Actor, target: EmployeeTarget): EditLevel {
  if (actor.tenantId !== target.tenantId) return "none";
  if (isAdmin(actor.role)) return "full";
  if (target.isSelf) return "self";
  return "none";
}

export function assertCanViewEmployee(actor: Actor, target: EmployeeTarget): ViewLevel {
  const level = employeeViewLevel(actor, target);
  if (level === "none") throw new ForbiddenError();
  return level;
}

/** Full profile access — used by the profile page and the employee detail API. */
export function assertCanViewFullEmployee(actor: Actor, target: EmployeeTarget): void {
  if (employeeViewLevel(actor, target) !== "full") throw new ForbiddenError();
}

export function assertCanEditEmployee(actor: Actor, target: EmployeeTarget): EditLevel {
  const level = employeeEditLevel(actor, target);
  if (level === "none") throw new ForbiddenError();
  return level;
}

/**
 * Documents are personnel-file material: only someone with *full* visibility of
 * the employee may list or download them.
 */
export function assertCanReadDocuments(actor: Actor, target: EmployeeTarget): void {
  assertCanViewFullEmployee(actor, target);
}

/**
 * Uploading and deleting documents on someone's file is an HR action. Employees
 * cannot add or remove documents on their own record, because those documents
 * are evidence (contracts, right-to-work checks) rather than personal notes.
 */
export function assertCanManageDocuments(actor: Actor, target: EmployeeTarget): void {
  if (actor.tenantId !== target.tenantId) throw new ForbiddenError();
  if (!isAdmin(actor.role)) throw new ForbiddenError();
}

// --- leave -----------------------------------------------------------------

/**
 * A leave request's status, mirrored from the schema. Duplicated as a literal
 * union rather than imported from the generated client so this module stays a
 * pure policy with no generated-code coupling beyond `Role`.
 */
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

/** The request being acted on, relative to the actor. */
export interface LeaveRequestTarget {
  tenantId: string;
  /** The employee the leave belongs to. */
  employee: EmployeeTarget;
  status: LeaveStatus;
}

/**
 * Who may see someone's leave. Deliberately narrower than the directory: when
 * someone is off is common knowledge, but *why* is not, so callers strip the
 * reason for anyone who only has "directory" sight of the employee.
 */
export function canViewLeave(actor: Actor, target: EmployeeTarget): boolean {
  return employeeViewLevel(actor, target) === "full";
}

export function assertCanViewLeave(actor: Actor, target: EmployeeTarget): void {
  if (!canViewLeave(actor, target)) throw new ForbiddenError();
}

/**
 * Booking leave is self-service. HR may also file on someone's behalf — people
 * phone in sick — but a manager may not book leave *for* a report.
 */
export function canRequestLeaveFor(actor: Actor, target: EmployeeTarget): boolean {
  if (actor.tenantId !== target.tenantId) return false;
  if (target.isSelf) return true;
  return isAdmin(actor.role);
}

export function assertCanRequestLeaveFor(actor: Actor, target: EmployeeTarget): void {
  if (!canRequestLeaveFor(actor, target)) throw new ForbiddenError();
}

/**
 * The request row and the employee it belongs to must *both* sit in the actor's
 * tenant. Checking only the request would let a row whose employee had been
 * re-parented elsewhere be decided by the wrong tenant's admin.
 */
function sameTenantThroughout(actor: Actor, target: LeaveRequestTarget): boolean {
  return actor.tenantId === target.tenantId && actor.tenantId === target.employee.tenantId;
}

/**
 * Approval routing. A manager decides for their downline, HR decides for
 * anyone — and nobody, including HR, approves their own request. Self-approval
 * is the one rule that has to hold regardless of role.
 */
export function canDecideLeave(actor: Actor, target: LeaveRequestTarget): boolean {
  if (!sameTenantThroughout(actor, target)) return false;
  if (target.status !== "PENDING") return false;
  if (target.employee.isSelf) return false;
  if (isAdmin(actor.role)) return true;
  return actor.role === "MANAGER" && target.employee.isInDownline;
}

export function assertCanDecideLeave(actor: Actor, target: LeaveRequestTarget): void {
  if (!canDecideLeave(actor, target)) throw new ForbiddenError();
}

/**
 * Cancellation. The requester may withdraw their own request while it is still
 * pending or approved (plans change); HR may cancel anyone's. A rejected or
 * already-cancelled request is terminal.
 */
export function canCancelLeave(actor: Actor, target: LeaveRequestTarget): boolean {
  if (!sameTenantThroughout(actor, target)) return false;
  if (target.status === "REJECTED" || target.status === "CANCELLED") return false;
  if (target.employee.isSelf) return true;
  return isAdmin(actor.role);
}

export function assertCanCancelLeave(actor: Actor, target: LeaveRequestTarget): void {
  if (!canCancelLeave(actor, target)) throw new ForbiddenError();
}

/**
 * Direct ledger adjustments — the manual "add 3 days TOIL" lever. Strictly HR:
 * a manager who could edit balances could approve unlimited leave for a report
 * by topping their balance up first.
 */
export function assertCanAdjustBalance(actor: Actor, target: EmployeeTarget): void {
  if (actor.tenantId !== target.tenantId) throw new ForbiddenError();
  assertCan(actor, "leave:manage");
}

// --- time & attendance -----------------------------------------------------

export type TimesheetStatusValue = "OPEN" | "SUBMITTED" | "APPROVED" | "REJECTED";

export interface TimesheetTarget {
  tenantId: string;
  employee: EmployeeTarget;
  status: TimesheetStatusValue;
}

/** Hours are personnel data: same visibility rule as leave and documents. */
export function canViewTimesheet(actor: Actor, target: EmployeeTarget): boolean {
  return employeeViewLevel(actor, target) === "full";
}

export function assertCanViewTimesheet(actor: Actor, target: EmployeeTarget): void {
  if (!canViewTimesheet(actor, target)) throw new ForbiddenError();
}

/**
 * Recording hours is self-service. HR may also record on someone's behalf, for
 * the person who forgot to clock in on Friday; a manager may not, because a
 * manager who could write hours could also approve the week they wrote.
 */
export function canRecordTimeFor(actor: Actor, target: EmployeeTarget): boolean {
  if (actor.tenantId !== target.tenantId) return false;
  if (target.isSelf) return true;
  return isAdmin(actor.role);
}

export function assertCanRecordTimeFor(actor: Actor, target: EmployeeTarget): void {
  if (!canRecordTimeFor(actor, target)) throw new ForbiddenError();
}

/**
 * A week stops being editable once it has been submitted, and only reopens if
 * it is sent back. Approved weeks are closed to everyone — correcting them is a
 * payroll adjustment, not an edit.
 */
export function canEditTimeEntry(actor: Actor, target: TimesheetTarget): boolean {
  if (!canRecordTimeFor(actor, target.employee)) return false;
  if (target.status === "APPROVED") return false;
  // A submitted week is locked for the owner but HR may still correct it.
  if (target.status === "SUBMITTED") return isAdmin(actor.role);
  return true;
}

export function assertCanEditTimeEntry(actor: Actor, target: TimesheetTarget): void {
  if (!canEditTimeEntry(actor, target)) throw new ForbiddenError();
}

/** Only the owner submits their own week — or HR on their behalf. */
export function canSubmitTimesheet(actor: Actor, target: TimesheetTarget): boolean {
  if (!canRecordTimeFor(actor, target.employee)) return false;
  return target.status === "OPEN" || target.status === "REJECTED";
}

export function assertCanSubmitTimesheet(actor: Actor, target: TimesheetTarget): void {
  if (!canSubmitTimesheet(actor, target)) throw new ForbiddenError();
}

/**
 * Approval mirrors leave: manager for their downline, HR for anyone, nobody for
 * themselves — and only on a week that has actually been submitted.
 */
export function canDecideTimesheet(actor: Actor, target: TimesheetTarget): boolean {
  if (actor.tenantId !== target.tenantId || actor.tenantId !== target.employee.tenantId) return false;
  if (target.status !== "SUBMITTED") return false;
  if (target.employee.isSelf) return false;
  if (isAdmin(actor.role)) return true;
  return actor.role === "MANAGER" && target.employee.isInDownline;
}

export function assertCanDecideTimesheet(actor: Actor, target: TimesheetTarget): void {
  if (!canDecideTimesheet(actor, target)) throw new ForbiddenError();
}

/**
 * Rejects any self-service payload that reaches beyond the allowed field set.
 * Returns the payload narrowed to the editable fields.
 */
export function restrictToSelfEditableFields<T extends Record<string, unknown>>(payload: T): Partial<T> {
  const allowed = new Set<string>(SELF_EDITABLE_EMPLOYEE_FIELDS);
  const rejected = Object.keys(payload).filter((key) => !allowed.has(key));
  if (rejected.length > 0) {
    throw new ForbiddenError(`You cannot change: ${rejected.join(", ")}.`);
  }
  return payload;
}
