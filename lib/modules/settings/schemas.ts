import { z } from "zod";
import { requiredText } from "@/lib/validation/common";

export const tenantProfileSchema = z.object({
  name: requiredText(160),
  countryCode: z.string().trim().length(2, "Use a two-letter country code.").toUpperCase(),
  timezone: requiredText(64),
  currency: z.string().trim().length(3, "Use a three-letter currency code.").toUpperCase(),
});

export const employmentTypeSchema = z.object({
  name: requiredText(80),
  isActive: z.coerce.boolean().default(true),
});

export const documentCategorySchema = z.object({
  name: requiredText(80),
  requiresExpiry: z.coerce.boolean().default(false),
  isActive: z.coerce.boolean().default(true),
});

export type TenantProfileInput = z.infer<typeof tenantProfileSchema>;
export type EmploymentTypeInput = z.infer<typeof employmentTypeSchema>;
export type DocumentCategoryInput = z.infer<typeof documentCategorySchema>;
