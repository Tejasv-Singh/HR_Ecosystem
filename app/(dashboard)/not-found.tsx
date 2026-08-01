import Link from "next/link";
import { Card } from "@/components/ui";

export default function DashboardNotFound() {
  return (
    <Card className="p-6">
      <h1 className="text-lg font-semibold tracking-tight">Not found</h1>
      <p className="mt-1 mb-4 text-sm text-[--color-muted]">That record does not exist in your organisation.</p>
      <Link href="/people" className="text-sm text-[--color-brand] hover:underline">
        Back to the directory
      </Link>
    </Card>
  );
}
