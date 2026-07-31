import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/app/(auth)/login/login-form";
import { getActor } from "@/lib/auth/session";
import { Card } from "@/components/ui";

export const metadata = { title: "Sign in · HR Platform" };

export default async function LoginPage() {
  if (await getActor()) redirect("/people");

  return (
    <Card className="p-6">
      <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 mb-5 text-sm text-[--color-muted]">Use your work email address.</p>

      <LoginForm />

      <div className="mt-5 space-y-2 border-t border-[--color-line] pt-4 text-sm text-[--color-muted]">
        <p>
          <Link href="/forgot-password" className="text-[--color-brand] hover:underline">
            Forgot your password?
          </Link>
        </p>
        <p>
          New organisation?{" "}
          <Link href="/signup" className="text-[--color-brand] hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </Card>
  );
}
