import type { APIRequestContext, Locator, Page } from "@playwright/test";

export const PASSWORD = "PlaywrightPass123!";

/**
 * A row in the people directory.
 *
 * A bare `getByText(name)` is ambiguous on this page: the same name also appears
 * in the "Manager" filter dropdown and in the nav's account link.
 */
export function directoryRow(page: Page, name: string): Locator {
  return page.locator("tbody tr").filter({ hasText: name });
}

/**
 * The value of a labelled field on an employee profile — the `<dd>` belonging to
 * the `<dt>` with this label. Matching on the value alone is ambiguous, because
 * the profile header repeats the job title and location above the detail list.
 */
export function detailValue(page: Page, label: string): Locator {
  return page.locator("dl > div").filter({ has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) }).locator("dd");
}

/** Unique per run so repeated local runs never collide on the email unique index. */
export function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

export interface Organisation {
  slug: string;
  adminEmail: string;
  organizationName: string;
}

/** Create a tenant and sign its first HR_ADMIN in, using the real sign-up flow. */
export async function signUpOrganisation(page: Page, label: string): Promise<Organisation> {
  const slug = unique(label);
  const adminEmail = `admin@${slug}.test`;
  const organizationName = `${label} ${slug}`;

  await page.goto("/signup");
  await page.getByLabel("Organisation name").fill(organizationName);
  await page.getByLabel("First name").fill("Ada");
  await page.getByLabel("Last name").fill("Admin");
  await page.getByLabel("Country code").fill("GB");
  await page.getByLabel("Work email").fill(adminEmail);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create organisation" }).click();

  await page.waitForURL("**/people");
  return { slug, adminEmail, organizationName };
}

export async function signIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/people");
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Sign out/ }).click();
  await page.waitForURL("**/login");
}

/** Create an employee through the API, using the browser's session cookies. */
export async function createEmployee(
  request: APIRequestContext,
  fields: Record<string, unknown>,
): Promise<{ id: string; workEmail: string }> {
  const response = await request.post("/api/employees", { data: fields });
  if (!response.ok()) throw new Error(`createEmployee failed (${response.status()}): ${await response.text()}`);
  return response.json();
}

/**
 * Invite an employee and return the acceptance link. The API returns it so that
 * environments without a mail provider can still complete the flow.
 */
export async function inviteEmployee(
  request: APIRequestContext,
  employeeId: string,
  role: "EMPLOYEE" | "MANAGER" | "HR_ADMIN" = "EMPLOYEE",
): Promise<string> {
  const response = await request.post("/api/invites", { data: { employeeId, role } });
  if (!response.ok()) throw new Error(`inviteEmployee failed (${response.status()}): ${await response.text()}`);
  const body = (await response.json()) as { link: string };
  return body.link;
}

/** Follow an invitation link and set a password, which also signs the user in. */
export async function acceptInvite(page: Page, link: string): Promise<void> {
  await page.goto(new URL(link).pathname);
  await page.getByLabel("New password").fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Activate account" }).click();
  await page.waitForURL("**/people");
}
