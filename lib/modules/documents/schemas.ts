import { z } from "zod";
import { cuidField, optionalDate } from "@/lib/validation/common";

export const documentUploadSchema = z.object({
  employeeId: cuidField,
  categoryId: cuidField,
  expiresAt: optionalDate,
});

export const expiringDocumentsSchema = z.object({
  /** How far ahead to look. 0 returns only already-expired documents. */
  withinDays: z.coerce.number().int().min(0).max(3650).default(60),
});

export type DocumentUploadInput = z.infer<typeof documentUploadSchema>;
