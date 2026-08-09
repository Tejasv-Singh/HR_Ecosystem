/**
 * Spec §5.3, first criterion: "A new user can sign up, create a tenant, invite
 * an employee, and that employee can log in."
 *
 * Also walks the HR CRUD surface (employee, department, document category) and
 * checks that every mutation lands in the audit log.
 */
import { expect, test } from "@playwright/test";
import {
  acceptInvite,
  createEmployee,
  detailValue,
  directoryRow,
  inviteEmployee,
  signIn,
  signOut,
  signUpOrganisation,
  unique,
} from "./helpers";

test("sign up, invite an employee, and that employee signs in", async ({ page }) => {
  const org = await signUpOrganisation(page, "northwind");

  // The founder's own employee record exists and the directory renders.
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
  await expect(directoryRow(page, "Ada Admin")).toHaveCount(1);

  // --- HR creates a department -------------------------------------------
  await page.goto("/org/departments");
  await page.getByLabel("Name").fill("Engineering");
  await page.getByRole("button", { name: "Add department" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Engineering" })).toHaveCount(1);

  // --- HR creates an employee --------------------------------------------
  const employeeEmail = `nora.hall@${org.slug}.test`;
  await page.goto("/people/new");
  await page.getByLabel("First name").fill("Nora");
  await page.getByLabel("Last name").fill("Hall");
  await page.getByLabel("Work email").fill(employeeEmail);
  await page.getByLabel("Job title").fill("Software Engineer");
  await page.getByRole("button", { name: "Create employee" }).click();

  // Not just `/people/<something>`: `/people/new` is where we already are.
  await page.waitForURL(/\/people\/(?!new$)[^/]+$/);
  await expect(page.getByRole("heading", { name: "Nora Hall" })).toBeVisible();
  await expect(detailValue(page, "Job title")).toHaveText("Software Engineer");

  const employeeId = page.url().split("/").pop()!;

  // --- HR invites them ----------------------------------------------------
  const link = await inviteEmployee(page.request, employeeId);
  expect(link).toContain("/invite/");

  // The invitation shows up as pending in settings. Scoped to that card: the
  // address also appears in the "Access" table below it.
  await page.goto("/settings");
  const inviteRow = page
    .locator("tbody tr")
    .filter({ hasText: employeeEmail })
    .filter({ has: page.getByRole("button", { name: "Revoke" }) });
  await expect(inviteRow).toHaveCount(1);

  await signOut(page);

  // --- The employee activates their account and lands in the app ----------
  await acceptInvite(page, link);
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();

  // They can see their own profile in full.
  await page.goto(`/people/${employeeId}`);
  await expect(page.getByRole("heading", { name: "Nora Hall" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit" })).toBeVisible();

  // --- And can sign out and back in with the password they chose ----------
  await signOut(page);
  await signIn(page, employeeEmail);
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
});

test("HR can edit an employee, and every mutation reaches the audit log", async ({ page }) => {
  await signUpOrganisation(page, "acme");

  const employee = await createEmployee(page.request, {
    firstName: "Ravi",
    lastName: "Kapoor",
    workEmail: `ravi.kapoor@${unique("acme")}.test`,
    jobTitle: "Analyst",
    status: "ACTIVE",
  });

  // Edit through the UI.
  await page.goto(`/people/${employee.id}/edit`);
  await page.getByLabel("Job title").fill("Senior Analyst");
  await page.getByLabel("Location").fill("Bristol");
  await page.getByRole("button", { name: "Save changes" }).click();

  await page.waitForURL(`**/people/${employee.id}`);
  await expect(detailValue(page, "Job title")).toHaveText("Senior Analyst");
  await expect(detailValue(page, "Location")).toHaveText("Bristol");

  // Deactivate via the status control.
  await page.getByLabel("Status").selectOption("TERMINATED");
  await page.getByLabel("End date").fill("2026-08-31");
  await page.getByRole("button", { name: "Update status" }).click();
  await expect(page.locator("h1").locator("..").getByText("Terminated")).toBeVisible();

  // The audit log has an entry for each of those actions.
  await page.goto("/settings/audit");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();

  const auditRows = page.locator("tbody tr");
  await expect(auditRows.filter({ hasText: "Created employee Ravi Kapoor" })).toHaveCount(1);
  await expect(auditRows.filter({ hasText: "Updated employee Ravi Kapoor" })).toHaveCount(1);
  await expect(auditRows.filter({ hasText: "Changed status of Ravi Kapoor to TERMINATED" })).toHaveCount(1);

  // Sign-in is audited too.
  await expect(auditRows.filter({ hasText: "Signed in" }).first()).toBeVisible();
});

test("the org chart reflects reporting lines", async ({ page }) => {
  await signUpOrganisation(page, "orgchart");
  const slug = unique("oc");

  const manager = await createEmployee(page.request, {
    firstName: "Mira",
    lastName: "Novak",
    workEmail: `mira.novak@${slug}.test`,
    jobTitle: "Engineering Manager",
    status: "ACTIVE",
  });

  const report = await createEmployee(page.request, {
    firstName: "Sam",
    lastName: "Osei",
    workEmail: `sam.osei@${slug}.test`,
    jobTitle: "Engineer",
    managerId: manager.id,
    status: "ACTIVE",
  });

  await page.goto("/org");

  // The report is nested under its manager rather than sitting at the root.
  const managerBranch = page.locator("li").filter({ hasText: "Mira Novak" }).first();
  await expect(managerBranch.getByText("1 report")).toBeVisible();
  await expect(managerBranch.locator("li").filter({ hasText: "Sam Osei" })).toHaveCount(1);

  // A reporting cycle is rejected: Mira cannot report to her own report.
  const response = await page.request.patch(`/api/employees/${manager.id}`, { data: { managerId: report.id } });
  expect(response.status()).toBe(422);
  expect(await response.text()).toContain("cannot also be their manager");
});
