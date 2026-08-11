import { z } from "zod";
import { isDateOnly } from "@/lib/modules/leave/calendar";
import { cuidField, optionalText, requiredText } from "@/lib/validation/common";

const dateOnlyField = z.string().trim().refine(isDateOnly, { message: "Enter a valid date." });

export const templateItemSchema = z.object({
  title: requiredText(160),
  description: optionalText(500),
  assignee: z.enum(["HR", "MANAGER", "EMPLOYEE"]).default("HR"),
  /** Days either side of the anchor. -3 is "three days before they start". */
  dueOffset: z.coerce.number().int().min(-365).max(365).default(0),
});

export const templateSchema = z.object({
  name: requiredText(120),
  kind: z.enum(["ONBOARDING", "OFFBOARDING"]),
  isActive: z.coerce.boolean().default(true),
  items: z.array(templateItemSchema).min(1, "Add at least one step.").max(60),
});

export const assignChecklistSchema = z.object({
  employeeId: cuidField,
  templateId: cuidField,
  /** Defaults to the employee's start date (or last day, when offboarding). */
  anchorDate: dateOnlyField.optional(),
});

export const taskCompletionSchema = z.object({
  completed: z.coerce.boolean(),
});

export type TemplateItemInput = z.infer<typeof templateItemSchema>;
export type TemplateInput = z.infer<typeof templateSchema>;
export type AssignChecklistInput = z.infer<typeof assignChecklistSchema>;
export type TaskCompletionInput = z.infer<typeof taskCompletionSchema>;
