/**
 * Spec §5.3: "A logged-in EMPLOYEE cannot access another employee's private
 * data via UI or direct API call (verified by test)."
 *
 * The API assertions matter as much as the UI ones — hiding a field in the
 * markup is not access control.
 */
import { expect, test } from "@playwright/test";
import { acceptInvite, createEmployee, inviteEmployee, signOut, signUpOrganisation, unique } from "./helpers";

const PRIVATE_FIELDS = ["phone", "personalEmail", "dateOfBirth", "address", "employeeNumber"] as const;

test("an employee cannot reach a colleague's private data by UI or API", async ({ page }) => {
  await signUpOrganisation(page, "isolation");
  const slug = unique("iso");

  // Two colleagues, both with private details on file.
  const nora = await createEmployee(page.request, {
    firstName: "Nora",
    lastName: "Hall",
    workEmail: `nora.hall@${slug}.test`,
    jobTitle: "Engineer",
    phone: "+44 7700 900001",
    personalEmail: "nora.private@personal.test",
    address: "1 Nora Street, London",
    status: "ACTIVE",
  });

  const colleague = await createEmployee(page.request, {
    firstName: "Blake",
    lastName: "Turner",
    workEmail: `blake.turner@${slug}.test`,
    jobTitle: "Designer",
    phone: "+44 7700 900002",
    personalEmail: "blake.private@personal.test",
    address: "2 Blake Avenue, Leeds",
    dateOfBirth: "1990-04-17",
    status: "ACTIVE",
  });

  const link = await inviteEmployee(page.request, nora.id, "EMPLOYEE");
  await signOut(page);
  await acceptInvite(page, link);

  // --- UI: the colleague's profile renders as a directory entry only ------
  await page.goto(`/people/${colleague.id}`);
  await expect(page.getByRole("heading", { name: "Blake Turner" })).toBeVisible();
  await expect(page.getByText("You are viewing the directory entry")).toBeVisible();

  await expect(page.getByText("blake.private@personal.test")).toHaveCount(0);
  await expect(page.getByText("+44 7700 900002")).toHaveCount(0);
  await expect(page.getByText("2 Blake Avenue, Leeds")).toHaveCount(0);
  // No edit affordance for someone else's record.
  await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);

  // --- API: the payload itself omits the private fields ------------------
  const detail = await page.request.get(`/api/employees/${colleague.id}`);
  expect(detail.status()).toBe(200);
  const body = (await detail.json()) as { level: string; employee: Record<string, unknown> };

  expect(body.level).toBe("directory");
  for (const field of PRIVATE_FIELDS) {
    expect(body.employee, `directory payload must not include ${field}`).not.toHaveProperty(field);
  }

  // --- API: their own record still comes back in full ---------------------
  const own = await page.request.get(`/api/employees/${nora.id}`);
  const ownBody = (await own.json()) as { level: string; employee: Record<string, unknown> };
  expect(ownBody.level).toBe("full");
  expect(ownBody.employee.phone).toBe("+44 7700 900001");

  // --- API: writes to a colleague are refused ----------------------------
  const write = await page.request.patch(`/api/employees/${colleague.id}`, { data: { phone: "+44 7700 900999" } });
  expect(write.status()).toBe(403);

  const remove = await page.request.delete(`/api/employees/${colleague.id}`);
  expect(remove.status()).toBe(403);

  // --- API: a colleague's documents and data export are refused ----------
  const exported = await page.request.get(`/api/employees/${colleague.id}/export`);
  expect(exported.status()).toBe(403);

  // --- API: admin-only surfaces are refused ------------------------------
  for (const path of ["/api/audit", "/api/invites", "/api/settings/employment-types", "/api/settings/document-categories"]) {
    const response = await page.request.get(path);
    expect(response.status(), `${path} should be forbidden for an employee`).toBe(403);
  }

  const createAttempt = await page.request.post("/api/employees", {
    data: { firstName: "Sneaky", lastName: "Insert", workEmail: `sneaky@${slug}.test` },
  });
  expect(createAttempt.status()).toBe(403);

  const departmentAttempt = await page.request.post("/api/departments", { data: { name: "Shadow IT" } });
  expect(departmentAttempt.status()).toBe(403);
});

test("self-service editing is limited to the allow-listed fields", async ({ page }) => {
  await signUpOrganisation(page, "selfservice");
  const slug = unique("self");

  const nora = await createEmployee(page.request, {
    firstName: "Nora",
    lastName: "Hall",
    workEmail: `nora.hall@${slug}.test`,
    jobTitle: "Engineer",
    status: "ACTIVE",
  });

  const link = await inviteEmployee(page.request, nora.id, "EMPLOYEE");
  await signOut(page);
  await acceptInvite(page, link);

  // Allowed: personal contact details.
  await page.goto(`/people/${nora.id}/edit`);
  await expect(page.getByText("Job and employment information is maintained by HR.")).toBeVisible();
  await page.getByLabel("Phone").fill("+44 7700 900123");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(`**/people/${nora.id}`);
  await expect(page.getByText("+44 7700 900123")).toBeVisible();

  // The privileged inputs are not even rendered in self-service mode.
  await page.goto(`/people/${nora.id}/edit`);
  await expect(page.getByLabel("Job title")).toHaveCount(0);
  await expect(page.getByLabel("Status")).toHaveCount(0);
  await expect(page.getByLabel("Manager")).toHaveCount(0);

  // And the API refuses them even when posted directly.
  for (const payload of [{ jobTitle: "CEO" }, { status: "ACTIVE" }, { managerId: null }, { workEmail: "new@example.test" }]) {
    const response = await page.request.patch(`/api/employees/${nora.id}`, { data: payload });
    expect(response.status(), `payload ${JSON.stringify(payload)} must be rejected`).toBe(403);
  }

  // The allowed field still works over the API.
  const allowed = await page.request.patch(`/api/employees/${nora.id}`, { data: { bio: "Builds robots." } });
  expect(allowed.status()).toBe(200);
});

test("records in another tenant are invisible, even to an HR administrator", async ({ page, browser }) => {
  // Tenant B, with an employee we will try to reach from tenant A.
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await signUpOrganisation(otherPage, "globex");
  const foreign = await createEmployee(otherContext.request, {
    firstName: "Foreign",
    lastName: "Employee",
    workEmail: `foreign@${unique("globex")}.test`,
    status: "ACTIVE",
  });
  await otherContext.close();

  // Tenant A's administrator has every permission — inside their own tenant.
  await signUpOrganisation(page, "initech");

  const read = await page.request.get(`/api/employees/${foreign.id}`);
  expect(read.status()).toBe(403);

  const write = await page.request.patch(`/api/employees/${foreign.id}`, { data: { jobTitle: "Owned" } });
  expect(write.status()).toBe(403);

  const remove = await page.request.delete(`/api/employees/${foreign.id}`);
  expect(remove.status()).toBe(403);

  const invite = await page.request.post("/api/invites", { data: { employeeId: foreign.id, role: "EMPLOYEE" } });
  expect(invite.status()).toBe(403);

  // And the foreign employee never appears in tenant A's directory.
  await page.goto("/people");
  await expect(page.getByText("Foreign Employee")).toHaveCount(0);
});

test("an unauthenticated caller gets nothing", async ({ browser }) => {
  const anonymous = await browser.newContext();

  for (const path of ["/api/employees", "/api/departments", "/api/audit", "/api/invites"]) {
    const response = await anonymous.request.get(path);
    expect(response.status(), `${path} should require authentication`).toBe(401);
  }

  // And the UI redirects rather than rendering the shell.
  const page = await anonymous.newPage();
  await page.goto("/people");
  await page.waitForURL("**/login**");

  await anonymous.close();
});
