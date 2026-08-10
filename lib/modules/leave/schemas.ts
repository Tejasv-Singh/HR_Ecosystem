import { z } from "zod";
import { isDateOnly } from "@/lib/modules/leave/calendar";
import { cuidField, optionalText, requiredText } from "@/lib/validation/common";

/**
 * Leave dates stay as `YYYY-MM-DD` strings all the way to the database layer.
 * Parsing them into `Date` here would reintroduce the timezone bug the calendar
 * module exists to avoid.
 */
const dateOnlyField = z
  .string()
  .trim()
  .refine(isDateOnly, { message: "Enter a valid date." });

const daysField = z.coerce
  .number()
  .min(0, "Cannot be negative.")
  .max(400, "That is more than a year.")
  .refine((value) => Number.isInteger(value * 2), { message: "Use whole or half days." });

export const leaveTypeSchema = z.object({
  name: requiredText(80),
  colour: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #64748b")
    .default("#64748b"),
  isPaid: z.coerce.boolean().default(true),
  requiresApproval: z.coerce.boolean().default(true),
  allowsHalfDay: z.coerce.boolean().default(true),
  allowsNegative: z.coerce.boolean().default(false),
  accrualMethod: z.enum(["NONE", "ANNUAL_GRANT", "MONTHLY_ACCRUAL"]).default("ANNUAL_GRANT"),
  annualDays: daysField.default(0),
  carryOverMaxDays: z.coerce.number().min(0).max(400).nullable().optional(),
  isActive: z.coerce.boolean().default(true),
});

export const holidaySchema = z.object({
  name: requiredText(120),
  date: dateOnlyField,
});

export const leaveRequestSchema = z
  .object({
    // Omitted means "for myself"; HR may file on someone else's behalf.
    employeeId: cuidField.optional(),
    leaveTypeId: cuidField,
    startDate: dateOnlyField,
    endDate: dateOnlyField,
    startHalf: z.coerce.boolean().default(false),
    endHalf: z.coerce.boolean().default(false),
    reason: optionalText(500),
  })
  .refine((value) => value.startDate <= value.endDate, {
    message: "The end date cannot be before the start date.",
    path: ["endDate"],
  });

export const leaveDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: optionalText(500),
});

export const balanceAdjustmentSchema = z.object({
  employeeId: cuidField,
  leaveTypeId: cuidField,
  year: z.coerce.number().int().min(2000).max(2100),
  // Signed: negative claws days back.
  days: z.coerce
    .number()
    .min(-400)
    .max(400)
    .refine((value) => value !== 0, { message: "Enter a non-zero adjustment." })
    .refine((value) => Number.isInteger(value * 2), { message: "Use whole or half days." }),
  note: requiredText(500),
});

export const leaveListQuerySchema = z.object({
  employeeId: cuidField.optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  scope: z.enum(["mine", "team", "all"]).default("mine"),
});

export type LeaveTypeInput = z.infer<typeof leaveTypeSchema>;
export type HolidayInput = z.infer<typeof holidaySchema>;
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;
export type LeaveDecisionInput = z.infer<typeof leaveDecisionSchema>;
export type BalanceAdjustmentInput = z.infer<typeof balanceAdjustmentSchema>;
export type LeaveListQuery = z.infer<typeof leaveListQuerySchema>;
