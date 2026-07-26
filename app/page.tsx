import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth/session";

export default async function HomePage() {
  const actor = await getActor();
  redirect(actor ? "/people" : "/login");
}
