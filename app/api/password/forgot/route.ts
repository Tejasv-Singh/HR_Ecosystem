import { json, parseJsonBody, route } from "@/lib/api";
import { RateLimitError } from "@/lib/errors";
import { forgotPasswordSchema } from "@/lib/modules/accounts/schemas";
import { requestPasswordReset } from "@/lib/modules/accounts/service";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const POST = route(async (request: Request) => {
  if (!rateLimit(clientKey(request, "forgot"), 10, 60 * 60 * 1000).ok) {
    throw new RateLimitError();
  }

  const { email } = await parseJsonBody(request, forgotPasswordSchema);
  await requestPasswordReset(email);

  // Always the same response, whether or not the address exists.
  return json({ ok: true });
});
