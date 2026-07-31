import { z } from "zod";

/** Trim, then treat an empty string as "not provided". */
export const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

export const requiredText = (max = 255) => z.string().trim().min(1, "Required").max(max);

export const optionalEmail = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value.toLowerCase()))
  .nullable()
  .optional()
  .refine((value) => value === null || value === undefined || z.email().safeParse(value).success, {
    message: "Enter a valid email address.",
  });

export const emailField = z
  .email("Enter a valid email address.")
  .transform((value) => value.trim().toLowerCase());

/** HTML date inputs post `YYYY-MM-DD` (or ""); store as a UTC-midnight Date. */
export const optionalDate = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((value) => {
    if (value === null || value === undefined || value === "") return null;
    const date = value instanceof Date ? value : new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  });

export const passwordField = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(200, "That password is too long.");

export const cuidField = z.string().min(1).max(64);

export const optionalCuid = z
  .string()
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();
