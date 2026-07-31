import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "@/app/(auth)/signup/signup-form";
import { getActor } from "@/lib/auth/session";
import { Card } from "@/components/ui";

export const metadata = { title: "Create an organisation · HR Platform" };

export default async function SignupPage() {
  if (await getActor()) redirect("/people");

  return (
    <Card className="p-6">
      <h1 className="text-lg font-semibold tracking-tight">Create your organisation</h1>
      <p className="mt-1 mb-5 text-sm text-[--color-muted]">
        You will become its first HR administrator and can invite colleagues afterwards.
      </p>

      <SignupForm />

      <p className="mt-5 border-t border-[--color-line] pt-4 text-sm text-[--color-muted]">
        Already have an account?{" "}
        <Link href="/login" className="text-[--color-brand] hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
