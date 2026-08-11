/**
 * Onboarding checklists: assigning a template copies it onto the employee, the
 * right people can tick steps off, and editing the template afterwards leaves
 * live checklists alone.
 */
import { expect, test } from "@playwright/test";
import { acceptInvite, createEmployee, inviteEmployee, signOut, signUpOrganisation, unique } from "./helpers";

async function createTemplate(page: import("@playwright/test").Page, body: Record<string, unknown>) {
  const response = await page.request.post("/api/checklists/templates", { data: body });
  if (!response.ok()) throw new Error(`createTemplate failed (${response.status()}): ${await response.text()}`);
  return response.json() as Promise<{ id: string; name: string }>;
}

test("a template is copied onto the employee, and each owner can tick their step", async ({ page }) => {
  await signUpOrganisation(page, "checkco");

  const template = await createTemplate(page, {
    name: `Joiner ${unique("t")}`,
    kind: "ONBOARDING",
    items: [
      { title: "Order a laptop", assignee: "HR", dueOffset: -7 },
      { title: "Prepare team introduction", assignee: "MANAGER", dueOffset: -1 },
      { title: "Sign the contract", assignee: "EMPLOYEE", dueOffset: 0 },
    ],
  });

  const manager = await createEmployee(page.request, {
    firstName: "Mary",
    lastName: "Manager",
    workEmail: `mary@${unique("m")}.test`,
    startDate: "2020-01-01",
  });
  const joiner = await createEmployee(page.request, {
    firstName: "Jo",
    lastName: "Joiner",
    workEmail: `jo@${unique("j")}.test`,
    managerId: manager.id,
    startDate: "2026-10-05",
  });

  const assigned = await page.request.post("/api/checklists", {
    data: { employeeId: joiner.id, templateId: template.id },
  });
  expect(assigned.ok(), await assigned.text()).toBeTruthy();

  // Due dates hang off the start date: -7 from 2026-10-05 is 2026-09-28.
  const lists = await page.request.get(`/api/checklists?employeeId=${joiner.id}`);
  const [checklist] = (await lists.json()) as {
    total: number;
    done: number;
    tasks: { id: string; title: string; assignee: string; dueDate: string; assigneeName: string | null }[];
  }[];
  expect(checklist.total).toBe(3);
  expect(checklist.done).toBe(0);

  const laptop = checklist.tasks.find((task) => task.title === "Order a laptop")!;
  expect(laptop.dueDate).toBe("2026-09-28");

  // The manager step resolved onto the actual manager; the HR one stays open.
  const intro = checklist.tasks.find((task) => task.assignee === "MANAGER")!;
  expect(intro.assigneeName).toBe("Mary Manager");
  expect(laptop.assigneeName).toBeNull();

  // HR ticks its own step off.
  const ticked = await page.request.patch(`/api/checklists/tasks/${laptop.id}`, { data: { completed: true } });
  expect(ticked.ok()).toBeTruthy();

  const managerLink = await inviteEmployee(page.request, manager.id, "MANAGER");
  const joinerLink = await inviteEmployee(page.request, joiner.id, "EMPLOYEE");
  await signOut(page);

  // --- the joiner sees only their own step on My tasks ----------------------
  await acceptInvite(page, joinerLink);
  await page.goto("/tasks");
  await expect(page.getByText("Sign the contract")).toBeVisible();
  await expect(page.getByText("Order a laptop")).toHaveCount(0);
  await expect(page.getByText("Prepare team introduction")).toHaveCount(0);

  // And cannot reach into someone else's step.
  const forbidden = await page.request.patch(`/api/checklists/tasks/${intro.id}`, { data: { completed: true } });
  expect(forbidden.status()).toBe(403);

  await page.getByRole("button", { name: "Complete Sign the contract" }).click();
  await expect(page.getByText("Nothing outstanding")).toBeVisible();
  await signOut(page);

  // --- the manager sees theirs ---------------------------------------------
  await acceptInvite(page, managerLink);
  await page.goto("/tasks");
  await expect(page.getByText("Prepare team introduction")).toBeVisible();
  await page.getByRole("button", { name: "Complete Prepare team introduction" }).click();
  await expect(page.getByText("Nothing outstanding")).toBeVisible();
});

test("deleting a template leaves checklists already handed out intact", async ({ page }) => {
  await signUpOrganisation(page, "checktpl");

  const template = await createTemplate(page, {
    name: `Joiner ${unique("t")}`,
    kind: "ONBOARDING",
    items: [{ title: "Order a laptop", assignee: "HR", dueOffset: 0 }],
  });

  const joiner = await createEmployee(page.request, {
    firstName: "Jo",
    lastName: "Joiner",
    workEmail: `jo@${unique("j")}.test`,
    startDate: "2026-10-05",
  });

  expect((await page.request.post("/api/checklists", { data: { employeeId: joiner.id, templateId: template.id } })).ok()).toBeTruthy();
  expect((await page.request.delete(`/api/checklists/templates/${template.id}`)).ok()).toBeTruthy();

  const lists = await page.request.get(`/api/checklists?employeeId=${joiner.id}`);
  const [checklist] = (await lists.json()) as { total: number; tasks: { title: string }[] }[];
  expect(checklist.total).toBe(1);
  expect(checklist.tasks[0].title).toBe("Order a laptop");
});

test("assigning needs an anchor date, and templates are admin-only", async ({ page }) => {
  await signUpOrganisation(page, "checkrules");

  const template = await createTemplate(page, {
    name: `Joiner ${unique("t")}`,
    kind: "ONBOARDING",
    items: [{ title: "Order a laptop", assignee: "HR", dueOffset: 0 }],
  });

  // No start date on the employee and no explicit date: refused rather than guessed.
  const noDate = await createEmployee(page.request, {
    firstName: "No",
    lastName: "Date",
    workEmail: `nodate@${unique("n")}.test`,
  });
  const rejected = await page.request.post("/api/checklists", {
    data: { employeeId: noDate.id, templateId: template.id },
  });
  expect(rejected.status()).toBe(422);
  expect(await rejected.text()).toContain("start date");

  // Supplying one explicitly works.
  const withDate = await page.request.post("/api/checklists", {
    data: { employeeId: noDate.id, templateId: template.id, anchorDate: "2026-11-02" },
  });
  expect(withDate.ok(), await withDate.text()).toBeTruthy();

  // An ordinary employee cannot create templates or assign checklists.
  const link = await inviteEmployee(page.request, noDate.id, "EMPLOYEE");
  await signOut(page);
  await acceptInvite(page, link);

  expect((await page.request.get("/api/checklists/templates")).status()).toBe(403);
  expect(
    (await page.request.post("/api/checklists", { data: { employeeId: noDate.id, templateId: template.id } })).status(),
  ).toBe(403);
});
