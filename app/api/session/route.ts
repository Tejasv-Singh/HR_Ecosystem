import { z } from "zod";
import { json, parseJsonBody, route } from "@/lib/api";
import { signIn, signOut } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { RateLimitError, UnauthorizedError } from "@/lib/errors";
import { emailField } from "@/lib/validation/common";

const loginSchema = z.object({ email: emailField, password: z.string().min(1) });

/** Sign in. */
export const POST = route(async (request: Request) => {
  // Per-IP throttle; `authorize` additionally throttles per account.
  if (!rateLimit(clientKey(request, "login"), 20, 15 * 60 * 1000).ok) {
    throw new RateLimitError();
  }

  const credentials = await parseJsonBody(request, loginSchema);

  try {
    // The LOGIN audit entry is written inside the credentials provider; see
    // lib/auth. It cannot be written here, because the session cookie this call
    // sets is not readable from the request that sets it.
    await signIn("credentials", { ...credentials, redirect: false });
  } catch {
    // Auth.js throws CredentialsSignin for any failure. Keep the message generic
    // so this endpoint cannot be used to discover which addresses exist.
    throw new UnauthorizedError("That email address and password do not match.");
  }

  return json({ ok: true });
});

/** Sign out. */
export const DELETE = route(async () => {
  await signOut({ redirect: false });
  return json({ ok: true });
});
