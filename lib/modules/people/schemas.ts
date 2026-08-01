import { z } from "zod";
import { SELF_EDITABLE_EMPLOYEE_FIELDS } from "@/lib/permissions";
import { emailField, optionalCuid, optionalDate, optionalEmail, optionalText, requiredText } from "@/lib/validation/common";

export const employeeStatusValues = ["ACTIVE", "ONBOARDING", "ON_LEAVE", "OFFBOARDING", "TERMINATED"] as const;

/** The full field set — only HR_ADMIN may submit this. */
export const employeeWriteSchema = z.object({
  firstName: requiredText(80),
  lastName: requiredText(80),
  preferredName: optionalText(80),
  workEmail: emailField,
  personalEmail: optionalEmail,
  phone: optionalText(40),
  jobTitle: optionalText(120),
  employeeNumber: optionalText(40),
  departmentId: optionalCuid,
  managerId: optionalCuid,
  employmentTypeId: optionalCuid,
  status: z.enum(employeeStatusValues).default("ACTIVE"),
  startDate: optionalDate,
  endDate: optionalDate,
  location: optionalText(120),
  dateOfBirth: optionalDate,
  address: optionalText(400),
  bio: optionalText(2000),
});

export const employeeCreateSchema = employeeWriteSchema;
export const employeeUpdateSchema = employeeWriteSchema.partial();

/**
 * Self-service edit. Derived from the permission layer's field list so the two
 * can never drift apart.
 */
export const employeeSelfUpdateSchema = employeeWriteSchema.pick(
  Object.fromEntries(SELF_EDITABLE_EMPLOYEE_FIELDS.map((field) => [field, true])) as Record<
    (typeof SELF_EDITABLE_EMPLOYEE_FIELDS)[number],
    true
  >,
).partial();

export const employeeFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  departmentId: z.string().trim().optional(),
  status: z.enum(employeeStatusValues).optional(),
  location: z.string().trim().max(120).optional(),
  managerId: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const emergencyContactSchema = z.object({
  name: requiredText(120),
  relationship: optionalText(80),
  phone: optionalText(40),
  email: optionalEmail,
});

export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;
export type EmployeeSelfUpdateInput = z.infer<typeof employeeSelfUpdateSchema>;
export type EmployeeFilter = z.infer<typeof employeeFilterSchema>;
export type EmergencyContactInput = z.infer<typeof emergencyContactSchema>;
