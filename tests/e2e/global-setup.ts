/**
 * Warm the dev server before the suite runs.
 *
 * `next dev` compiles a route the first time it is requested, which for this app
 * is 5-10s per route. That cost lands inside whichever assertion happens to be
 * first through the door and reads exactly like a product bug. Walking the routes
 * once up front moves the compile out of the tests, so assertion timeouts can stay
 * short enough to be useful.
 *
 * The warm-up creates a throwaway tenant of its own; it never touches the data the
 * tests rely on.
 */
import { request, type FullConfig } from "@playwright/test";

const PAGES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/people",
  "/people/new",
  "/org",
  "/org/departments",
  "/documents",
  "/settings",
  "/settings/audit",
];

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://127.0.0.1:3100";
  const context = await request.newContext({ baseURL });

  try {
    const stamp = `warmup-${Date.now()}`;
    const password = "WarmupPass123!";
    const signup = await context.post("/api/signup", {
      data: {
        organizationName: `Warm Up ${stamp}`,
        firstName: "Warm",
        lastName: "Up",
        countryCode: "GB",
        email: `admin@${stamp}.test`,
        password,
        confirmPassword: password,
      },
    });

    if (!signup.ok()) {
      // Not fatal: the suite still runs, it just pays the compile cost itself.
      console.warn(`[global-setup] warm-up sign-up failed (${signup.status()}); skipping route warm-up`);
      return;
    }

    for (const path of PAGES) {
      await context.get(path).catch(() => undefined);
    }

    // The dynamic segments compile separately from the collection routes.
    const listing = await context.get("/api/employees");
    if (listing.ok()) {
      const body = (await listing.json()) as { items?: { id: string }[] };
      const id = body.items?.[0]?.id;
      if (id) {
        await context.get(`/people/${id}`).catch(() => undefined);
        await context.get(`/people/${id}/edit`).catch(() => undefined);
      }
    }
  } finally {
    await context.dispose();
  }
}
