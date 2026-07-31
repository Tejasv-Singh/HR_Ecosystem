import { z } from "zod";
import { emailField, passwordField, requiredText } from "@/lib/validation/common";

/** Public sign-up: creates a Tenant plus its first HR_ADMIN. */
export const signupSchema = z
  .object({
    organizationName: requiredText(160),
    countryCode: z.string().trim().length(2).toUpperCase().default("US"),
    firstName: requiredText(80),
    lastName: requiredText(80),
    email: emailField,
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const inviteCreateSchema = z.object({
  employeeId: z.string().min(1),
  role: z.enum(["HR_ADMIN", "MANAGER", "EMPLOYEE"]).default("EMPLOYEE"),
});

export const acceptInviteSchema = z
  .object({
    token: z.string().min(1),
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({ email: emailField });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type SignupInput = z.infer<typeof signupSchema>;
export type InviteCreateInput = z.infer<typeof inviteCreateSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
