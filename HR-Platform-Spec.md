
# HR Platform — Build Specification

> **Purpose of this document:** A build-ready spec to hand to Claude Code. It defines the product vision, tech stack, architecture, data model, and a phased roadmap. **Phase 1 (Core HR + Employee Directory) is scoped in full detail and is what should be built first.** Later phases are described at feature level to guide architecture decisions, not to build now.

---

## 1. Vision & Guiding Principles

Build a modular HR platform ("the ecosystem") where each functional area is a self-contained module sharing one employee/org data core. Start SMB-first (single-country assumptions are fine), but keep the data model and architecture flexible enough to grow toward mid-market and multi-entity later.

**Principles for every decision:**

- **Modular monolith first.** One codebase, cleanly separated modules. Do *not* build microservices yet.
- **One source of truth.** The `Employee` and `Organization` models are the core; every other module references them, never duplicates them.
- **Multi-tenant from day one.** Every table is scoped to a `tenantId` (an employing organization). This is cheap to add now and very expensive to retrofit.
- **Permission-aware everywhere.** No screen or API returns data the current user's role shouldn't see.
- **Audit everything.** Every create/update/delete on sensitive records writes an audit log entry.
- **Config over hardcode.** Leave types, job titles, departments, document categories, etc. are data, not enums baked into code.

---

## 2. Recommended Tech Stack

Chosen for strong Claude Code ergonomics, type safety end-to-end, and a large ecosystem.

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript | Shared types across front and back end |
| Framework | Next.js (App Router) | Full-stack; API routes / server actions + React UI |
| Database | PostgreSQL | Relational, strong for HR data + reporting |
| ORM | Prisma | Type-safe schema + migrations |
| Auth | Auth.js (NextAuth) or Clerk | Email/password + SSO-ready; RBAC on top |
| UI | Tailwind CSS + shadcn/ui | Fast, consistent components |
| Validation | Zod | Shared client/server schemas |
| File storage | S3-compatible (e.g. AWS S3 / R2) | Employee documents |
| Background jobs | A queue (e.g. BullMQ + Redis) or cron | Accruals, reminders, notifications |
| Email | Resend / Postmark | Invites, notifications |
| Testing | Vitest + Playwright | Unit + E2E |
| Deploy | Vercel or Docker + a Node host | Postgres via managed provider |

> If you (Claude Code) have a strong reason to deviate, note it in a `DECISIONS.md` and proceed — don't silently swap core pieces.

---

## 3. High-Level Architecture

```
/app
  /(auth)            login, invite acceptance
  /(dashboard)       authenticated shell + nav
    /people          employee directory + profiles   [Phase 1]
    /org             org chart                        [Phase 1]
    /documents       document management              [Phase 1]
    /settings        tenant, roles, config            [Phase 1]
    /recruitment     ATS                              [Phase 2]
    /leave           leave & attendance               [Phase 2]
    /performance     reviews & goals                  [Phase 3]
    ...
/lib
  /auth              session, RBAC helpers
  /db                Prisma client
  /modules           <-- one folder per module, self-contained
    /people
    /org
    /documents
    /audit
  /permissions       policy definitions
  /validation        Zod schemas
/prisma
  schema.prisma
/components          shared UI
```

**Module contract:** each module exposes its own service layer (`lib/modules/<name>/service.ts`), Zod schemas, and UI routes. Cross-module access goes through service functions, never by reaching into another module's tables directly.

---

## 4. Core Data Model (Phase 1)

Prisma-flavored pseudocode. This is the foundation; get it right before building features.

```prisma
model Tenant {              // an employing organization (multi-tenant root)
  id          String   @id @default(cuid())
  name        String
  countryCode String                       // for future localization
  createdAt   DateTime @default(now())
  employees   Employee[]
  departments Department[]
}

model User {                // a login account
  id         String  @id @default(cuid())
  email      String  @unique
  passwordHash String?                     // null if SSO
  employee   Employee?
  role       Role
  tenantId   String
}

enum Role {
  SUPER_ADMIN    // platform-level
  HR_ADMIN
  MANAGER
  EMPLOYEE
}

model Employee {
  id           String   @id @default(cuid())
  tenantId     String
  userId       String?  @unique            // link to login (may be pending invite)
  firstName    String
  lastName     String
  workEmail    String
  personalEmail String?
  phone        String?
  jobTitle     String?
  departmentId String?
  managerId    String?                      // self-relation -> org chart
  employmentType String?                    // full-time, contractor, etc.
  status       EmployeeStatus @default(ACTIVE)
  startDate    DateTime?
  endDate      DateTime?
  location     String?
  // personal details, emergency contacts, etc. as related models
  documents    Document[]
  createdAt    DateTime @default(now())
}

enum EmployeeStatus { ACTIVE ONBOARDING ON_LEAVE OFFBOARDING TERMINATED }

model Department {
  id       String @id @default(cuid())
  tenantId String
  name     String
  parentId String?                          // nested departments
  leadId   String?                          // an Employee
}

model Document {
  id         String   @id @default(cuid())
  tenantId   String
  employeeId String
  category   String                          // contract, ID, certification...
  fileKey    String                          // storage reference
  fileName   String
  expiresAt  DateTime?                        // for reminders
  uploadedBy String
  createdAt  DateTime @default(now())
}

model AuditLog {
  id         String   @id @default(cuid())
  tenantId   String
  actorId    String
  action     String                          // CREATE/UPDATE/DELETE
  entityType String
  entityId   String
  changes    Json?
  createdAt  DateTime @default(now())
}
```

Later modules add their own tables (JobPosting, Candidate, LeaveRequest, Review, etc.) that reference `Employee`/`Tenant`.

---

## 5. Phase 1 — MVP Scope (BUILD THIS)

**Goal:** a working, secured, multi-tenant Core HR system that a small company could actually use to store and manage their people.

### 5.1 Features

1. **Auth & tenant setup**
   - Sign up creates a Tenant + first HR_ADMIN user.
   - Invite flow: HR admin invites employees by email; invite creates a pending `User` linked to an `Employee`.
   - Login, logout, password reset.

2. **Employee directory**
   - List/search/filter employees (by name, department, status, location).
   - Employee profile page: personal info, job info, manager, documents.
   - Create/edit/deactivate employees (HR_ADMIN); employees can edit a limited set of their own fields (self-service).

3. **Org chart**
   - Visual reporting tree derived from `managerId`.
   - Department management (create, nest, assign lead).

4. **Document management**
   - Upload/download documents against an employee, categorized.
   - Expiry dates + a list of expiring/expired documents.

5. **Roles & permissions**
   - Four roles (see enum). Enforced on every API route and UI action.
   - EMPLOYEE sees only self + public directory info; MANAGER sees their reports; HR_ADMIN sees all in tenant.

6. **Settings**
   - Tenant profile, departments, document categories, employment types (all configurable).

7. **Audit log**
   - Record all sensitive mutations; simple viewer for HR_ADMIN.

### 5.2 Explicit non-goals for Phase 1

No payroll, no leave/attendance, no recruitment, no performance, no integrations, no mobile app, no multi-country tax logic. Architecture should *not preclude* these, but do not build them.

### 5.3 Phase 1 acceptance criteria

- A new user can sign up, create a tenant, invite an employee, and that employee can log in.
- HR admin can CRUD employees, departments, and documents.
- Org chart renders correctly from manager relationships.
- A logged-in EMPLOYEE cannot access another employee's private data via UI or direct API call (verified by test).
- Every mutation appears in the audit log.
- Seed script populates a demo tenant with ~15 employees across 3 departments.
- Unit tests on the permission layer + at least one E2E happy-path test pass.

---

## 6. Phased Roadmap (beyond MVP)

Build outward one module at a time. Each phase assumes the previous is stable.

**Phase 2 — Daily-use operations**
- Leave management (types, balances, accruals, approval workflow, holiday calendar).
- Time & attendance (clock in/out or timesheets, overtime).
- Recruitment / ATS (job postings, candidate pipeline, interview scheduling, offers).
- Onboarding & offboarding checklists.

**Phase 3 — Talent & growth**
- Performance reviews (self/manager/peer/360), goals/OKRs, 1:1s.
- Learning management (courses, certifications, skill tracking).
- Compensation & benefits administration.

**Phase 4 — Intelligence & engagement**
- HR analytics dashboards (headcount, attrition, DEI, cost-to-hire).
- Engagement surveys / eNPS, recognition, announcements feed.
- HR helpdesk / ticketing.

**Phase 5 — Platform & scale**
- Integrations marketplace (Slack, calendars, accounting, SSO/SCIM).
- Public API + webhooks.
- AI assistant (policy Q&A, JD drafting, resume screening).
- Multi-entity / multi-country (localization, per-country compliance).
- Mobile apps.

---

## 7. Cross-Cutting Concerns (design in from the start)

- **Security:** RBAC enforced server-side on every request; input validated with Zod; secrets in env; rate limiting on auth; file uploads scanned/size-limited.
- **Privacy/compliance:** personal data minimization, data export + delete per employee (GDPR-style), configurable retention. Even SMB-first, don't paint yourself into a corner.
- **Notifications:** a single notification service (email now, in-app + others later).
- **Internationalization:** wrap user-facing strings; store dates in UTC; currency/locale as tenant settings.
- **Observability:** structured logging, error tracking, basic health checks.
- **Testing discipline:** every module ships with unit tests for its service + permission logic.

---

## 8. Instructions for Claude Code

1. **Read this whole document first.** Then create `DECISIONS.md` recording the exact stack versions you chose and any deviations.
2. **Scaffold the project** with the recommended stack. Get auth + multi-tenant + Prisma migrations working before any feature UI.
3. **Build Phase 1 only.** Follow the module structure in §3 and the data model in §4. Treat §5.3 as your definition of done.
4. **Work in vertical slices** (one feature end-to-end: schema → service → API → UI → test) rather than building all schemas, then all APIs.
5. **Write a seed script early** so the app is demoable at every step.
6. **Enforce permissions server-side from the first endpoint** — don't bolt on RBAC later.
7. **Keep a running `PROGRESS.md`** checklist mirroring §5.1 so progress is visible.
8. **Do not start Phase 2+ features** until Phase 1 acceptance criteria pass. Use later phases only to avoid architectural dead-ends.
9. When a requirement is ambiguous, prefer the simplest choice that doesn't block future phases, and note it in `DECISIONS.md`.

---

## 9. Suggested Build Order (checklist)

- [ ] Project scaffold, env, Prisma + Postgres connected
- [ ] Core schema: Tenant, User, Employee, Department, Document, AuditLog + migration
- [ ] Auth: signup (creates tenant + admin), login, logout, password reset
- [ ] RBAC helpers + permission policy layer + tests
- [ ] Invite flow (admin invites employee → employee logs in)
- [ ] Employee directory: list, search, filter, profile view
- [ ] Employee CRUD + self-service limited edit
- [ ] Department management
- [ ] Org chart rendering
- [ ] Document upload/download + expiry list
- [ ] Settings (tenant, departments, categories, employment types)
- [ ] Audit log writer + viewer
- [ ] Seed script (demo tenant, ~15 employees)
- [ ] Unit tests (permissions) + one E2E happy path
- [ ] Verify all §5.3 acceptance criteria
```
