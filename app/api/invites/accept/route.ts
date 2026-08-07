import { json, parseJsonBody, route } from "@/lib/api";
import { signIn } from "@/lib/auth";
import { RateLimitError } from "@/lib/errors";
import { acceptInviteSchema } from "@/lib/modules/accounts/schemas";
import { acceptInvite } from "@/lib/modules/accounts/service";
import { clientKey, rateLimit } from "@/lib/rate-limit";

/** Set a password against an invite token, then sign the new user in. */
export const POST = route(async (request: Request) => {
  if (!rateLimit(clientKey(request, "invite-accept"), 20, 60 * 60 * 1000).ok) {
    throw new RateLimitError();
  }

  const input = await parseJsonBody(request, acceptInviteSchema);
  const user = await acceptInvite(input);

  await signIn("credentials", { email: user.email, password: input.password, redirect: false });

  return json({ ok: true });
});
