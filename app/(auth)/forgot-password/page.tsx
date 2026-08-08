import Link from "next/link";
import { ForgotPasswordForm } from "@/app/(auth)/forgot-password/forgot-password-form";
import { Card } from "@/components/ui";

export const metadata = { title: "Reset your password · HR Platform" };

export default function ForgotPasswordPage() {
  return (
    <Card className="p-6">
      <h1 className="text-lg font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1 mb-5 text-sm text-[--color-muted]">
        Enter your work email address and we will send you a reset link.
      </p>

      <ForgotPasswordForm />

      <p className="mt-5 border-t border-[--color-line] pt-4 text-sm">
        <Link href="/login" className="text-[--color-brand] hover:underline">
          Back to sign in
        </Link>
      </p>
    </Card>
  );
}
