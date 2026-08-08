import Link from "next/link";
import { SetPasswordForm } from "@/components/set-password-form";
import { isResetTokenValid } from "@/lib/modules/accounts/service";
import { Alert, Card } from "@/components/ui";

export const metadata = { title: "Choose a new password · HR Platform" };

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!(await isResetTokenValid(token))) {
    return (
      <Card className="p-6 space-y-4">
        <h1 className="text-lg font-semibold tracking-tight">This reset link is no longer valid</h1>
        <Alert>Reset links expire after an hour and can only be used once.</Alert>
        <Link href="/forgot-password" className="block text-sm text-[--color-brand] hover:underline">
          Request a new link
        </Link>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h1 className="text-lg font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1 mb-5 text-sm text-[--color-muted]">You will be able to sign in with it straight away.</p>

      <SetPasswordForm
        token={token}
        endpoint="/api/password/reset"
        submitLabel="Save new password"
        successMessage="Your password has been changed. You can now sign in."
      />

      <p className="mt-5 border-t border-[--color-line] pt-4 text-sm">
        <Link href="/login" className="text-[--color-brand] hover:underline">
          Back to sign in
        </Link>
      </p>
    </Card>
  );
}
