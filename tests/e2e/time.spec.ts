/**
 * Time & attendance: recording hours, submitting a week, and the locking rules
 * that stop a week changing after someone has signed it off.
 */
import { expect, test } from "@playwright/test";
import { acceptInvite, createEmployee, inviteEmployee, signOut, signUpOrganisation, unique } from "./helpers";

/** The Monday of the week containing a date, mirroring weekStartOf on the server. */
function mondayOf(date: Date): string {
  const cursor = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7));
  return cursor.toISOString().slice(0, 10);
}

const THIS_MONDAY = mondayOf(new Date());
const TUESDAY = (() => {
  const cursor = new Date(`${THIS_MONDAY}T00:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  return cursor.toISOString().slice(0, 10);
})();

test("hours are recorded, submitted, approved by a manager, and then locked", async ({ page }) => {
  await signUpOrganisation(page, "timeco");

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

  // --- the employee records two days ---------------------------------------
  await acceptInvite(page, reportLink);

  for (const workDate of [THIS_MONDAY, TUESDAY]) {
    const response = await page.request.post("/api/time/entries", {
      data: { workDate, startTime: "09:00", endTime: "17:30", note: "Build work" },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  }

  await page.goto("/time");
  await expect(page.getByText("Recorded").locator("..")).toContainText("17h");

  // Submit the week.
  const submitted = await page.request.post("/api/time/timesheets", { data: { week: THIS_MONDAY } });
  expect(submitted.ok(), await submitted.text()).toBeTruthy();

  // A submitted week is closed to its owner.
  const blocked = await page.request.post("/api/time/entries", {
    data: { workDate: THIS_MONDAY, startTime: "18:00", endTime: "19:00" },
  });
  expect(blocked.status()).toBe(403);
  await signOut(page);

  // --- the manager approves -------------------------------------------------
  await acceptInvite(page, managerLink);
  await page.goto("/time/approvals");

  const row = page.locator("tbody tr").filter({ hasText: "Rita Report" });
  await expect(row).toContainText("17");
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(page.locator("tbody tr").filter({ hasText: "Rita Report" }).first()).toContainText("Approved");

  // An approved week cannot be decided a second time.
  const sheets = await page.request.get("/api/time/timesheets?scope=team");
  const [sheet] = (await sheets.json()) as { id: string; status: string }[];
  expect(sheet.status).toBe("APPROVED");
  const again = await page.request.patch(`/api/time/timesheets/${sheet.id}`, { data: { decision: "REJECTED" } });
  expect(again.status()).toBe(403);
});

test("a manager cannot write hours for a report, and nobody signs off their own week", async ({ page }) => {
  await signUpOrganisation(page, "timerules");

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

  // HR may record on someone's behalf.
  const onBehalf = await page.request.post("/api/time/entries", {
    data: { employeeId: report.id, workDate: THIS_MONDAY, startTime: "09:00", endTime: "12:00" },
  });
  expect(onBehalf.ok(), await onBehalf.text()).toBeTruthy();

  // The admin's own week, submitted by themselves.
  const ownEntry = await page.request.post("/api/time/entries", {
    data: { workDate: THIS_MONDAY, startTime: "09:00", endTime: "17:00" },
  });
  expect(ownEntry.ok()).toBeTruthy();
  const ownSheet = await page.request.post("/api/time/timesheets", { data: { week: THIS_MONDAY } });
  expect(ownSheet.ok()).toBeTruthy();
  const { id: ownSheetId } = (await ownSheet.json()) as { id: string };

  // Even an HR admin cannot approve their own week.
  const selfDecision = await page.request.patch(`/api/time/timesheets/${ownSheetId}`, { data: { decision: "APPROVED" } });
  expect(selfDecision.status()).toBe(403);
  await signOut(page);

  // A manager may not write hours for someone they would then approve.
  await acceptInvite(page, managerLink);
  const asManager = await page.request.post("/api/time/entries", {
    data: { employeeId: report.id, workDate: TUESDAY, startTime: "09:00", endTime: "17:00" },
  });
  expect(asManager.status()).toBe(403);
});

test("overlapping entries on the same day are rejected", async ({ page }) => {
  await signUpOrganisation(page, "timeoverlap");

  const first = await page.request.post("/api/time/entries", {
    data: { workDate: THIS_MONDAY, startTime: "09:00", endTime: "12:00" },
  });
  expect(first.ok()).toBeTruthy();

  const overlapping = await page.request.post("/api/time/entries", {
    data: { workDate: THIS_MONDAY, startTime: "11:00", endTime: "14:00" },
  });
  expect(overlapping.status()).toBe(409);

  // Butting up against the previous entry is fine.
  const adjacent = await page.request.post("/api/time/entries", {
    data: { workDate: THIS_MONDAY, startTime: "12:00", endTime: "14:00" },
  });
  expect(adjacent.ok(), await adjacent.text()).toBeTruthy();

  // End before start is a validation failure, not a negative entry.
  const backwards = await page.request.post("/api/time/entries", {
    data: { workDate: THIS_MONDAY, startTime: "15:00", endTime: "14:00" },
  });
  expect(backwards.status()).toBe(422);
});
