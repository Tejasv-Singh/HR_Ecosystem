import Link from "next/link";
import { SetPasswordForm } from "@/components/set-password-form";
import { getInviteByToken } from "@/lib/modules/accounts/service";
import { Alert, Card } from "@/components/ui";

export const metadata = { title: "Accept invitation · HR Platform" };

export default async function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInviteByToken(token);

  if (!invite) {
    return (
      <Card className="p-6 space-y-4">
        <h1 className="text-lg font-semibold tracking-tight">This invitation is no longer valid</h1>
        <Alert>
          The link has expired, been revoked, or has already been used. Ask an administrator at your organisation to send a
          new one.
        </Alert>
        <Link href="/login" className="block text-sm text-[--color-brand] hover:underline">
          Back to sign in
        </Link>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h1 className="text-lg font-semibold tracking-tight">Welcome, {invite.employee.firstName}</h1>
      <p className="mt-1 mb-5 text-sm text-[--color-muted]">
        Set a password to activate your account at {invite.tenant.name}. You will sign in with {invite.email}.
      </p>

      <SetPasswordForm token={token} endpoint="/api/invites/accept" submitLabel="Activate account" redirectTo="/people" />
    </Card>
  );
}
