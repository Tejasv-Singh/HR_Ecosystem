import { json, parseJsonBody, route } from "@/lib/api";
import { signIn } from "@/lib/auth";
import { RateLimitError } from "@/lib/errors";
import { signupSchema } from "@/lib/modules/accounts/schemas";
import { signup } from "@/lib/modules/accounts/service";
import { clientKey, rateLimit } from "@/lib/rate-limit";

/** Public sign-up: creates a tenant and its first HR_ADMIN, then signs them in. */
export const POST = route(async (request: Request) => {
  if (!rateLimit(clientKey(request, "signup"), 5, 60 * 60 * 1000).ok) {
    throw new RateLimitError("Too many sign-up attempts from this address.");
  }

  const input = await parseJsonBody(request, signupSchema);
  const { tenant } = await signup(input);

  // The LOGIN audit entry is written inside the credentials provider; see lib/auth.
  await signIn("credentials", { email: input.email, password: input.password, redirect: false });

  return json({ ok: true, tenantId: tenant.id }, 201);
});
