import { z } from "zod";
import { isDateOnly } from "@/lib/modules/leave/calendar";
import { cuidField, emailField, optionalCuid, optionalText, requiredText } from "@/lib/validation/common";

const dateOnlyField = z.string().trim().refine(isDateOnly, { message: "Enter a valid date." });

export const postingSchema = z.object({
  title: requiredText(160),
  departmentId: optionalCuid,
  hiringManagerId: optionalCuid,
  employmentTypeId: optionalCuid,
  location: optionalText(120),
  description: optionalText(4000),
  openings: z.coerce.number().int().min(1).max(100).default(1),
  status: z.enum(["DRAFT", "OPEN", "ON_HOLD", "CLOSED"]).default("DRAFT"),
});

export const candidateSchema = z.object({
  firstName: requiredText(80),
  lastName: requiredText(80),
  email: emailField,
  phone: optionalText(40),
  source: optionalText(80),
  notes: optionalText(2000),
});

/** Adding someone to a pipeline: an existing candidate, or a new one inline. */
export const applicationSchema = z.object({
  postingId: cuidField,
  candidateId: cuidField.optional(),
  candidate: candidateSchema.optional(),
});

export const stageMoveSchema = z
  .object({
    stage: z.enum(["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED"]),
    reason: optionalText(500),
    /** Only read when moving to HIRED. */
    startDate: dateOnlyField.optional(),
    onboardingTemplateId: optionalCuid,
  })
  .refine((value) => value.stage !== "HIRED" || Boolean(value.startDate), {
    message: "A start date is required to hire someone.",
    path: ["startDate"],
  });

export const interviewSchema = z.object({
  applicationId: cuidField,
  interviewerId: optionalCuid,
  scheduledAt: z.string().min(1, "Pick a date and time."),
  minutes: z.coerce.number().int().min(15).max(480).default(60),
  stageName: optionalText(80),
});

export const interviewOutcomeSchema = z.object({
  outcome: z.enum(["PENDING", "ADVANCE", "REJECT"]),
  notes: optionalText(4000),
});

export const postingListQuerySchema = z.object({
  status: z.enum(["DRAFT", "OPEN", "ON_HOLD", "CLOSED"]).optional(),
});

export type PostingInput = z.infer<typeof postingSchema>;
export type CandidateInput = z.infer<typeof candidateSchema>;
export type ApplicationInput = z.infer<typeof applicationSchema>;
export type StageMoveInput = z.infer<typeof stageMoveSchema>;
export type InterviewInput = z.infer<typeof interviewSchema>;
export type InterviewOutcomeInput = z.infer<typeof interviewOutcomeSchema>;
export type PostingListQuery = z.infer<typeof postingListQuerySchema>;
