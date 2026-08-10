/**
 * Leave: the booking and approval round trip, and the rules that stop someone
 * quietly approving their own time off.
 */
import { expect, test } from "@playwright/test";
import { acceptInvite, createEmployee, inviteEmployee, signIn, signOut, signUpOrganisation, unique } from "./helpers";

/** A leave type with a known entitlement, created straight through the API. */
async function createLeaveType(
  request: import("@playwright/test").APIRequestContext,
  fields: Record<string, unknown>,
): Promise<{ id: string; name: string }> {
  const response = await request.post("/api/leave/types", { data: fields });
  if (!response.ok()) throw new Error(`createLeaveType failed (${response.status()}): ${await response.text()}`);
  return response.json();
}

test("an employee books leave, their manager approves it, and the balance moves", async ({ page }) => {
  await signUpOrganisation(page, "leaveco");

  const typeName = `Annual ${unique("t")}`;
  await createLeaveType(page.request, { name: typeName, annualDays: 20, accrualMethod: "ANNUAL_GRANT", requiresApproval: true });

  // A manager and one report beneath them.
  const manager = await createEmployee(page.request, {
    firstName: "Mary",
    lastName: "Manager",
    workEmail: `mary@${unique("m")}.test`,
    startDate: "2020-01-01",
  });
  const report = await createEmployee(page.request, {
    firstName: "Rita",
    lastName: "Report",
    workEmail: `rita@${unique("r")}.test`,
    managerId: manager.id,
    startDate: "2020-01-01",
  });

  const managerLink = await inviteEmployee(page.request, manager.id, "MANAGER");
  const reportLink = await inviteEmployee(page.request, report.id, "EMPLOYEE");
  await signOut(page);

  // --- the employee books a week -------------------------------------------
  await acceptInvite(page, reportLink);
  await page.goto("/leave");

  // Two tables on this page carry the type name, so scope by table rather than
  // by rendered dates — month abbreviations are an ICU detail, not a contract.
  const balanceRow = page.locator("table").first().locator("tbody tr").filter({ hasText: typeName });
  const requestRow = page.locator("table").nth(1).locator("tbody tr").filter({ hasText: typeName });

  await expect(balanceRow).toContainText("20");

  // Exact matching: the Next dev-tools button also carries a "…To…" accessible name.
  await page.getByLabel("Type", { exact: true }).selectOption({ label: typeName });
  await page.getByLabel("From", { exact: true }).fill("2026-09-07"); // Monday
  await page.getByLabel("To", { exact: true }).fill("2026-09-11"); // Friday
  await page.getByRole("button", { name: "Submit request" }).click();

  await expect(requestRow).toContainText("Pending");
  await expect(requestRow).toContainText("5");

  // Pending days are held back immediately, before anyone has approved.
  await expect(balanceRow).toContainText("15");

  // An employee has no approvals queue at all.
  await page.goto("/leave/approvals");
  await expect(page.getByText("Nothing to approve")).toBeVisible();
  await signOut(page);

  // --- the manager approves -------------------------------------------------
  await acceptInvite(page, managerLink);
  await page.goto("/leave/approvals");

  const pendingRow = page.locator("tbody tr").filter({ hasText: "Rita Report" });
  await expect(pendingRow).toContainText("5");
  await pendingRow.getByRole("button", { name: "Approve" }).click();

  await expect(page.locator("tbody tr").filter({ hasText: "Rita Report" }).first()).toContainText("Approved");
  await signOut(page);

  // --- the employee sees it approved, and the days are now taken ------------
  await signIn(page, report.workEmail);
  await page.goto("/leave");
  await expect(requestRow).toContainText("Approved");

  // Entitled 20, taken 5, nothing pending, 15 left.
  await expect(balanceRow).toContainText("5");
  await expect(balanceRow).toContainText("15");
});

test("nobody can approve their own leave, whatever their role", async ({ page }) => {
  await signUpOrganisation(page, "selfapprove");

  const typeName = `Annual ${unique("t")}`;
  const type = await createLeaveType(page.request, {
    name: typeName,
    annualDays: 20,
    accrualMethod: "ANNUAL_GRANT",
    requiresApproval: true,
  });

  // The signed-in admin books leave for themselves.
  const created = await page.request.post("/api/leave/requests", {
    data: { leaveTypeId: type.id, startDate: "2026-09-14", endDate: "2026-09-15" },
  });
  expect(created.ok()).toBeTruthy();
  const own = (await created.json()) as { id: string; status: string };
  expect(own.status).toBe("PENDING");

  // Even as HR_ADMIN, the decision endpoint refuses.
  const decision = await page.request.patch(`/api/leave/requests/${own.id}`, { data: { decision: "APPROVED" } });
  expect(decision.status()).toBe(403);

  // And the approvals queue never lists it.
  await page.goto("/leave/approvals");
  await expect(page.getByText("Nothing to approve")).toBeVisible();
});

test("leave rules are enforced by the API, not just the form", async ({ page }) => {
  await signUpOrganisation(page, "leaverules");

  const type = await createLeaveType(page.request, {
    name: `Annual ${unique("t")}`,
    annualDays: 5,
    accrualMethod: "ANNUAL_GRANT",
    requiresApproval: true,
  });

  // Weekend-only range: no working days to charge.
  const weekend = await page.request.post("/api/leave/requests", {
    data: { leaveTypeId: type.id, startDate: "2026-09-12", endDate: "2026-09-13" },
  });
  expect(weekend.status()).toBe(422);
  expect(await weekend.text()).toContain("no working days");

  // More days than the entitlement allows.
  const tooLong = await page.request.post("/api/leave/requests", {
    data: { leaveTypeId: type.id, startDate: "2026-09-07", endDate: "2026-09-25" },
  });
  expect(tooLong.status()).toBe(422);

  // A valid booking, then an overlapping one.
  const first = await page.request.post("/api/leave/requests", {
    data: { leaveTypeId: type.id, startDate: "2026-09-07", endDate: "2026-09-08" },
  });
  expect(first.ok()).toBeTruthy();

  const overlapping = await page.request.post("/api/leave/requests", {
    data: { leaveTypeId: type.id, startDate: "2026-09-08", endDate: "2026-09-09" },
  });
  expect(overlapping.status()).toBe(409);

  // Cancelling the first frees the dates up again.
  const { id } = (await first.json()) as { id: string };
  expect((await page.request.delete(`/api/leave/requests/${id}`)).ok()).toBeTruthy();

  const retry = await page.request.post("/api/leave/requests", {
    data: { leaveTypeId: type.id, startDate: "2026-09-08", endDate: "2026-09-09" },
  });
  expect(retry.ok()).toBeTruthy();
});
