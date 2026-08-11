import { z } from "zod";
import { isDateOnly } from "@/lib/modules/leave/calendar";
import { cuidField, optionalText } from "@/lib/validation/common";

const dateOnlyField = z.string().trim().refine(isDateOnly, { message: "Enter a valid date." });

/** `HH:MM` from a time input. Stored against the work date, never parsed as an instant. */
const timeOfDayField = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time as HH:MM.");

export const timeEntrySchema = z
  .object({
    employeeId: cuidField.optional(),
    workDate: dateOnlyField,
    startTime: timeOfDayField,
    endTime: timeOfDayField,
    note: optionalText(300),
  })
  .refine((value) => value.startTime < value.endTime, {
    message: "The end time must be after the start time.",
    path: ["endTime"],
  });

export const timeEntryUpdateSchema = z
  .object({
    startTime: timeOfDayField,
    endTime: timeOfDayField,
    note: optionalText(300),
  })
  .refine((value) => value.startTime < value.endTime, {
    message: "The end time must be after the start time.",
    path: ["endTime"],
  });

export const clockInSchema = z.object({
  note: optionalText(300),
});

export const weekQuerySchema = z.object({
  employeeId: cuidField.optional(),
  /** Any date inside the week; the service snaps it to the Monday. */
  week: dateOnlyField.optional(),
});

export const timesheetDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: optionalText(500),
});

export const timesheetListQuerySchema = z.object({
  status: z.enum(["OPEN", "SUBMITTED", "APPROVED", "REJECTED"]).optional(),
  scope: z.enum(["mine", "team"]).default("mine"),
});

export type TimeEntryInput = z.infer<typeof timeEntrySchema>;
export type TimeEntryUpdateInput = z.infer<typeof timeEntryUpdateSchema>;
export type ClockInInput = z.infer<typeof clockInSchema>;
export type WeekQuery = z.infer<typeof weekQuerySchema>;
export type TimesheetDecisionInput = z.infer<typeof timesheetDecisionSchema>;
export type TimesheetListQuery = z.infer<typeof timesheetListQuerySchema>;
