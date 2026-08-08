import { json, parseJsonBody, route } from "@/lib/api";
import { RateLimitError } from "@/lib/errors";
import { resetPasswordSchema } from "@/lib/modules/accounts/schemas";
import { resetPassword } from "@/lib/modules/accounts/service";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const POST = route(async (request: Request) => {
  if (!rateLimit(clientKey(request, "reset"), 20, 60 * 60 * 1000).ok) {
    throw new RateLimitError();
  }

  await resetPassword(await parseJsonBody(request, resetPasswordSchema));
  return json({ ok: true });
});
