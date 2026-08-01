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
  | "directory:read";

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
  ],
  MANAGER: ["directory:read"],
  EMPLOYEE: ["directory:read"],
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
