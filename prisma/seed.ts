/**
 * Demo data (spec §5.3): one tenant, three departments, fifteen employees
 * across a real reporting tree, documents with a mix of expiry dates, and a
 * login for each of the four roles.
 *
 * Idempotent: re-running wipes the demo tenant and rebuilds it, so `npm run
 * db:seed` is safe at any point.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { hashPassword } from "../lib/auth/password.js";

const DEMO_TENANT = "Northwind Robotics";
const PASSWORD = "DemoPassword123!";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

interface SeedPerson {
  firstName: string;
  lastName: string;
  jobTitle: string;
  department: "Engineering" | "People & Operations" | "Commercial";
  managerKey: string | null;
  key: string;
  employmentType: string;
  location: string;
  status?: "ACTIVE" | "ONBOARDING" | "ON_LEAVE";
  /** Which role their login gets, if they should have one. */
  role?: "HR_ADMIN" | "MANAGER" | "EMPLOYEE";
  startDate: string;
}

const PEOPLE: SeedPerson[] = [
  // Leadership
  { key: "ada", firstName: "Ada", lastName: "Whitfield", jobTitle: "Chief Executive Officer", department: "Commercial", managerKey: null, employmentType: "Full-time", location: "London", startDate: "2016-02-01" },

  // People & Operations
  { key: "priya", firstName: "Priya", lastName: "Raman", jobTitle: "Head of People", department: "People & Operations", managerKey: "ada", employmentType: "Full-time", location: "London", role: "HR_ADMIN", startDate: "2018-06-11" },
  { key: "tom", firstName: "Tom", lastName: "Beckett", jobTitle: "People Operations Specialist", department: "People & Operations", managerKey: "priya", employmentType: "Full-time", location: "London", startDate: "2021-09-06" },
  { key: "nadia", firstName: "Nadia", lastName: "Kovač", jobTitle: "Recruiter", department: "People & Operations", managerKey: "priya", employmentType: "Contractor", location: "Remote", startDate: "2023-03-20" },

  // Engineering
  { key: "marcus", firstName: "Marcus", lastName: "Oyelaran", jobTitle: "VP of Engineering", department: "Engineering", managerKey: "ada", employmentType: "Full-time", location: "Manchester", role: "MANAGER", startDate: "2017-11-13" },
  { key: "hannah", firstName: "Hannah", lastName: "Lindqvist", jobTitle: "Engineering Manager", department: "Engineering", managerKey: "marcus", employmentType: "Full-time", location: "Manchester", startDate: "2019-04-01" },
  { key: "raj", firstName: "Raj", lastName: "Deshmukh", jobTitle: "Senior Software Engineer", department: "Engineering", managerKey: "hannah", employmentType: "Full-time", location: "Manchester", role: "EMPLOYEE", startDate: "2020-01-20" },
  { key: "leah", firstName: "Leah", lastName: "Fontaine", jobTitle: "Software Engineer", department: "Engineering", managerKey: "hannah", employmentType: "Full-time", location: "Remote", startDate: "2022-05-09" },
  { key: "sven", firstName: "Sven", lastName: "Aaltonen", jobTitle: "Software Engineer", department: "Engineering", managerKey: "hannah", employmentType: "Full-time", location: "Remote", status: "ON_LEAVE", startDate: "2021-02-15" },
  { key: "yuki", firstName: "Yuki", lastName: "Tanabe", jobTitle: "QA Engineer", department: "Engineering", managerKey: "hannah", employmentType: "Part-time", location: "Manchester", startDate: "2023-08-14" },
  { key: "omar", firstName: "Omar", lastName: "Haddad", jobTitle: "Platform Engineer", department: "Engineering", managerKey: "marcus", employmentType: "Full-time", location: "London", startDate: "2022-10-03" },
  { key: "grace", firstName: "Grace", lastName: "Mbeki", jobTitle: "Engineering Intern", department: "Engineering", managerKey: "marcus", employmentType: "Intern", location: "Manchester", status: "ONBOARDING", startDate: "2026-07-27" },

  // Commercial
  { key: "elena", firstName: "Elena", lastName: "Marchetti", jobTitle: "Head of Sales", department: "Commercial", managerKey: "ada", employmentType: "Full-time", location: "London", startDate: "2019-01-07" },
  { key: "david", firstName: "David", lastName: "Ferreira", jobTitle: "Account Executive", department: "Commercial", managerKey: "elena", employmentType: "Full-time", location: "London", startDate: "2021-06-21" },
  { key: "amira", firstName: "Amira", lastName: "Suleiman", jobTitle: "Customer Success Manager", department: "Commercial", managerKey: "elena", employmentType: "Full-time", location: "Remote", startDate: "2022-02-28" },
];

const DEPARTMENTS = ["Engineering", "People & Operations", "Commercial"] as const;
const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contractor", "Intern"];
const DOCUMENT_CATEGORIES = [
  { name: "Contract", requiresExpiry: false },
  { name: "Identification", requiresExpiry: true },
  { name: "Right to work", requiresExpiry: true },
  { name: "Certification", requiresExpiry: true },
  { name: "Payroll", requiresExpiry: false },
  { name: "Other", requiresExpiry: false },
];

function email(person: SeedPerson): string {
  const last = person.lastName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
  return `${person.firstName.toLowerCase()}.${last}@northwind.test`;
}

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

async function main() {
  console.log("Seeding demo data …");

  // Start clean. Cascades remove employees, documents, invites and audit rows.
  await prisma.tenant.deleteMany({ where: { name: DEMO_TENANT } });

  const passwordHash = await hashPassword(PASSWORD);

  const tenant = await prisma.tenant.create({
    data: {
      name: DEMO_TENANT,
      countryCode: "GB",
      timezone: "Europe/London",
      currency: "GBP",
      employmentTypes: { create: EMPLOYMENT_TYPES.map((name) => ({ name })) },
      documentCategories: { create: DOCUMENT_CATEGORIES },
    },
    include: { employmentTypes: true, documentCategories: true },
  });

  const departments = new Map<string, string>();
  for (const name of DEPARTMENTS) {
    const department = await prisma.department.create({ data: { tenantId: tenant.id, name } });
    departments.set(name, department.id);
  }

  const employmentTypes = new Map(tenant.employmentTypes.map((type) => [type.name, type.id]));
  const categories = new Map(tenant.documentCategories.map((category) => [category.name, category.id]));

  // Two passes: create everyone first, then wire up managers, because a manager
  // may appear after their report in the list.
  const employeeIds = new Map<string, string>();

  for (const person of PEOPLE) {
    const employee = await prisma.employee.create({
      data: {
        tenantId: tenant.id,
        firstName: person.firstName,
        lastName: person.lastName,
        workEmail: email(person),
        jobTitle: person.jobTitle,
        departmentId: departments.get(person.department),
        employmentTypeId: employmentTypes.get(person.employmentType),
        location: person.location,
        status: person.status ?? "ACTIVE",
        startDate: new Date(`${person.startDate}T00:00:00.000Z`),
        phone: "+44 20 7946 0000",
        employeeNumber: `NR-${String(employeeIds.size + 1).padStart(4, "0")}`,
      },
    });
    employeeIds.set(person.key, employee.id);
  }

  for (const person of PEOPLE) {
    if (!person.managerKey) continue;
    await prisma.employee.update({
      where: { id: employeeIds.get(person.key)! },
      data: { managerId: employeeIds.get(person.managerKey)! },
    });
  }

  // Department leads.
  await prisma.department.update({ where: { id: departments.get("Engineering")! }, data: { leadId: employeeIds.get("marcus")! } });
  await prisma.department.update({ where: { id: departments.get("People & Operations")! }, data: { leadId: employeeIds.get("priya")! } });
  await prisma.department.update({ where: { id: departments.get("Commercial")! }, data: { leadId: employeeIds.get("elena")! } });

  // Logins — one per role, so every permission path is demoable.
  const logins: { key: string; role: "SUPER_ADMIN" | "HR_ADMIN" | "MANAGER" | "EMPLOYEE" }[] = [
    { key: "ada", role: "SUPER_ADMIN" },
    { key: "priya", role: "HR_ADMIN" },
    { key: "marcus", role: "MANAGER" },
    { key: "raj", role: "EMPLOYEE" },
  ];

  for (const login of logins) {
    const person = PEOPLE.find((candidate) => candidate.key === login.key)!;
    const user = await prisma.user.create({
      data: { tenantId: tenant.id, email: email(person), passwordHash, role: login.role, status: "ACTIVE" },
    });
    await prisma.employee.update({ where: { id: employeeIds.get(login.key)! }, data: { userId: user.id } });
  }

  // Emergency contacts for a couple of people.
  await prisma.emergencyContact.createMany({
    data: [
      { tenantId: tenant.id, employeeId: employeeIds.get("raj")!, name: "Anjali Deshmukh", relationship: "Partner", phone: "+44 7700 900123" },
      { tenantId: tenant.id, employeeId: employeeIds.get("leah")!, name: "Claire Fontaine", relationship: "Mother", phone: "+33 6 12 34 56 78" },
    ],
  });

  // Documents with a spread of expiry dates so the expiring/expired lists have
  // something to show.
  const documentSeeds: { key: string; category: string; fileName: string; expiresInDays: number | null }[] = [
    { key: "raj", category: "Contract", fileName: "raj-deshmukh-contract.pdf", expiresInDays: null },
    { key: "raj", category: "Right to work", fileName: "raj-deshmukh-visa.pdf", expiresInDays: 21 },
    { key: "leah", category: "Contract", fileName: "leah-fontaine-contract.pdf", expiresInDays: null },
    { key: "leah", category: "Identification", fileName: "leah-fontaine-passport.pdf", expiresInDays: -14 },
    { key: "yuki", category: "Certification", fileName: "yuki-tanabe-iso-cert.pdf", expiresInDays: 45 },
    { key: "omar", category: "Right to work", fileName: "omar-haddad-permit.pdf", expiresInDays: -3 },
    { key: "grace", category: "Contract", fileName: "grace-mbeki-internship.pdf", expiresInDays: null },
    { key: "david", category: "Certification", fileName: "david-ferreira-sales-cert.pdf", expiresInDays: 200 },
  ];

  const hrUser = await prisma.user.findUniqueOrThrow({ where: { email: email(PEOPLE.find((p) => p.key === "priya")!) } });

  for (const seed of documentSeeds) {
    await prisma.document.create({
      data: {
        tenantId: tenant.id,
        employeeId: employeeIds.get(seed.key)!,
        categoryId: categories.get(seed.category)!,
        // No bytes are written: these rows demonstrate the list and expiry
        // views. Downloading one will report a missing file, which is the
        // honest outcome for a placeholder.
        fileKey: `seed/${seed.fileName}`,
        fileName: seed.fileName,
        mimeType: "application/pdf",
        sizeBytes: 128_000,
        expiresAt: seed.expiresInDays === null ? null : daysFromNow(seed.expiresInDays),
        uploadedBy: hrUser.id,
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      actorId: hrUser.id,
      actorEmail: hrUser.email,
      action: "CREATE",
      entityType: "Tenant",
      entityId: tenant.id,
      summary: `Seeded demo organisation ${tenant.name}`,
    },
  });

  console.log(`\nSeeded "${tenant.name}" with ${PEOPLE.length} employees across ${DEPARTMENTS.length} departments.`);
  console.log(`\nSign in with any of these (password: ${PASSWORD}):`);
  for (const login of logins) {
    const person = PEOPLE.find((candidate) => candidate.key === login.key)!;
    console.log(`  ${login.role.padEnd(12)} ${email(person)}`);
  }
  console.log("");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
