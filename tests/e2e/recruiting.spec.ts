/**
 * Recruitment: the pipeline from applied to hired, the hand-off into an employee
 * record, and the scoping that keeps a manager inside their own reqs.
 */
import { expect, test } from "@playwright/test";
import { acceptInvite, createEmployee, inviteEmployee, signOut, signUpOrganisation, unique } from "./helpers";

async function createPosting(page: import("@playwright/test").Page, body: Record<string, unknown>) {
  const response = await page.request.post("/api/recruiting/postings", { data: body });
  if (!response.ok()) throw new Error(`createPosting failed (${response.status()}): ${await response.text()}`);
  return response.json() as Promise<{ id: string; title: string }>;
}

async function addCandidate(page: import("@playwright/test").Page, postingId: string, email: string) {
  const response = await page.request.post("/api/recruiting/applications", {
    data: { postingId, candidate: { firstName: "Cass", lastName: "Andidate", email, source: "Referral" } },
  });
  if (!response.ok()) throw new Error(`addApplication failed (${response.status()}): ${await response.text()}`);
  return response.json() as Promise<{ id: string; stage: string }>;
}

test("a candidate moves through the pipeline and becomes an employee on hire", async ({ page }) => {
  await signUpOrganisation(page, "hireco");

  const posting = await createPosting(page, { title: "Senior Engineer", status: "OPEN", openings: 1 });
  const email = `cass-${unique("c")}@example.test`;
  const application = await addCandidate(page, posting.id, email);
  expect(application.stage).toBe("APPLIED");

  for (const stage of ["SCREENING", "INTERVIEW", "OFFER"]) {
    const moved = await page.request.patch(`/api/recruiting/applications/${application.id}`, { data: { stage } });
    expect(moved.ok(), `${stage}: ${await moved.text()}`).toBeTruthy();
  }

  // Hiring needs a start date.
  const noDate = await page.request.patch(`/api/recruiting/applications/${application.id}`, { data: { stage: "HIRED" } });
  expect(noDate.status()).toBe(422);

  const hired = await page.request.patch(`/api/recruiting/applications/${application.id}`, {
    data: { stage: "HIRED", startDate: "2026-12-01" },
  });
  expect(hired.ok(), await hired.text()).toBeTruthy();
  const { hiredEmployeeId } = (await hired.json()) as { hiredEmployeeId: string | null };
  expect(hiredEmployeeId).toBeTruthy();

  // The employee exists, carries the posting's title, and is onboarding.
  const employee = await page.request.get(`/api/employees/${hiredEmployeeId}`);
  expect(employee.ok()).toBeTruthy();
  // The endpoint returns the profile alongside the caller's access level.
  const { employee: record } = (await employee.json()) as {
    employee: { workEmail: string; jobTitle: string; status: string };
  };
  expect(record.workEmail).toBe(email);
  expect(record.jobTitle).toBe("Senior Engineer");
  expect(record.status).toBe("ONBOARDING");

  // The single opening was filled, so the req closed itself.
  const postings = await page.request.get("/api/recruiting/postings");
  const rows = (await postings.json()) as { id: string; status: string }[];
  expect(rows.find((row) => row.id === posting.id)?.status).toBe("CLOSED");

  // Hired is terminal.
  const again = await page.request.patch(`/api/recruiting/applications/${application.id}`, {
    data: { stage: "REJECTED", reason: "changed our mind" },
  });
  expect(again.status()).toBe(422);
});

test("a hiring manager runs their own req but cannot hire, and cannot see other reqs", async ({ page }) => {
  await signUpOrganisation(page, "hiremgr");

  const manager = await createEmployee(page.request, {
    firstName: "Mary",
    lastName: "Manager",
    workEmail: `mary@${unique("m")}.test`,
    startDate: "2020-01-01",
  });

  const theirs = await createPosting(page, { title: "Their Req", status: "OPEN", hiringManagerId: manager.id });
  const others = await createPosting(page, { title: "Someone Elses Req", status: "OPEN" });
  const application = await addCandidate(page, theirs.id, `cass-${unique("c")}@example.test`);

  const managerLink = await inviteEmployee(page.request, manager.id, "MANAGER");
  await signOut(page);
  await acceptInvite(page, managerLink);

  // Only their own req is listed.
  const listed = await page.request.get("/api/recruiting/postings");
  const rows = (await listed.json()) as { id: string; title: string }[];
  expect(rows).toHaveLength(1);
  expect(rows[0].id).toBe(theirs.id);

  // And someone else's is not reachable directly.
  expect((await page.request.get(`/api/recruiting/postings/${others.id}`)).status()).toBe(403);

  // They can advance their own pipeline...
  const advanced = await page.request.patch(`/api/recruiting/applications/${application.id}`, {
    data: { stage: "SCREENING" },
  });
  expect(advanced.ok(), await advanced.text()).toBeTruthy();

  // ...but hiring is HR's call.
  const hire = await page.request.patch(`/api/recruiting/applications/${application.id}`, {
    data: { stage: "HIRED", startDate: "2026-12-01" },
  });
  expect(hire.status()).toBe(403);

  // And they cannot create reqs of their own.
  expect((await page.request.post("/api/recruiting/postings", { data: { title: "Mine" } })).status()).toBe(403);
});

test("recruitment is invisible to ordinary employees", async ({ page }) => {
  await signUpOrganisation(page, "hireemp");

  const posting = await createPosting(page, { title: "Engineer", status: "OPEN" });
  const staff = await createEmployee(page.request, {
    firstName: "Eve",
    lastName: "Employee",
    workEmail: `eve@${unique("e")}.test`,
    startDate: "2020-01-01",
  });
  const link = await inviteEmployee(page.request, staff.id, "EMPLOYEE");
  await signOut(page);
  await acceptInvite(page, link);

  expect((await page.request.get("/api/recruiting/postings")).status()).toBe(403);
  expect((await page.request.get(`/api/recruiting/postings/${posting.id}`)).status()).toBe(403);

  // The nav does not offer it either.
  await page.goto("/people");
  await expect(page.getByRole("link", { name: "Recruitment" })).toHaveCount(0);
});

test("duplicate applications and rejections without a reason are refused", async ({ page }) => {
  await signUpOrganisation(page, "hirerules");

  const posting = await createPosting(page, { title: "Engineer", status: "OPEN" });
  const email = `cass-${unique("c")}@example.test`;
  const application = await addCandidate(page, posting.id, email);

  // Same person, same req.
  const duplicate = await page.request.post("/api/recruiting/applications", {
    data: { postingId: posting.id, candidate: { firstName: "Cass", lastName: "Andidate", email } },
  });
  expect(duplicate.status()).toBe(409);

  // Rejection needs a reason.
  const noReason = await page.request.patch(`/api/recruiting/applications/${application.id}`, {
    data: { stage: "REJECTED" },
  });
  expect(noReason.status()).toBe(422);

  const rejected = await page.request.patch(`/api/recruiting/applications/${application.id}`, {
    data: { stage: "REJECTED", reason: "Not enough experience" },
  });
  expect(rejected.ok()).toBeTruthy();

  // Rejected is terminal too.
  const revive = await page.request.patch(`/api/recruiting/applications/${application.id}`, {
    data: { stage: "SCREENING" },
  });
  expect(revive.status()).toBe(422);
});
