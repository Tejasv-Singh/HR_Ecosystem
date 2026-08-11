# HR Ecosystem

A self-hosted HR system of record for small and mid-sized companies — the thing
that replaces the spreadsheet of employees, the shared drive of scanned
contracts, and the email thread where people ask for time off.

It holds who works here, who they report to, what documents are on their file,
and how much leave they have left. Every screen and every API response is
filtered by what the signed-in person is allowed to see, and every change to a
sensitive record is written to an audit trail.

Built with Next.js (App Router), PostgreSQL + Prisma, Auth.js, Tailwind, and Zod.

## What it actually does

**An HR administrator** signs up, which creates the organisation and their own
account in one step. They add employees, set reporting lines and departments,
upload contracts and right-to-work documents to each person's file, define the
leave types the company offers, and invite people to log in. They can see
everything in their organisation and nothing outside it.

**An employee** gets an invite email, sets a password, and lands on a directory
of colleagues — names, job titles, departments, work emails. That's all they see
of other people. On their own record they get the full profile, their documents,
and their leave balances, and they can correct their own phone number, address
and emergency contacts without raising a ticket. They book time off and watch it
go from pending to approved.

**A manager** sees everything an employee sees, plus the full profiles of anyone
beneath them in the reporting tree — direct reports and their reports, at any
depth. Leave requests from that downline land in their approval inbox. They
cannot see peers, cannot see their own manager's file, and cannot approve their
own leave.

Four roles in total: `SUPER_ADMIN`, `HR_ADMIN`, `MANAGER`, `EMPLOYEE`.

The whole thing is multi-tenant, so one deployment can host many organisations
with no data ever crossing between them.

## Modules

- **People** — employee directory with search and filters, full profiles,
  emergency contacts, and employment status tracking (active / on leave / terminated).
- **Org** — departments, managers, and reporting lines, with an org chart view.
- **Documents** — per-employee file uploads sorted into configurable categories.
  Downloads go through a permission check, never a direct file URL.
- **Accounts** — email/password sign-in, invite-based onboarding, password reset.
- **Settings** — tenant details, user roles, pending invites, and editable
  employment types and document categories.
- **Leave** — configurable leave types, booking with half days, manager approval
  routing, public holidays, and balances derived from a transaction ledger.
- **Time & attendance** — clock in/out or typed entries, a weekly timesheet
  submitted and approved as one unit, and overtime measured against the
  contracted week. Expected hours already account for weekends, public holidays
  and approved leave.
- **Checklists** — reusable onboarding and offboarding templates whose steps are
  owned by HR, the manager, or the joiner themselves, with due dates relative to
  the start date or last day. Everyone gets a "my tasks" view of what's on them.
- **Recruitment** — job postings, a candidate pipeline from applied through to
  hired, interview scheduling with outcomes, and a hire that creates the employee
  record and can start their onboarding checklist in the same action.
- **Audit log** — every create/update/delete on a sensitive record is written to
  an audit trail, browsable with filters.

## Design notes

**Multi-tenant from day one.** Every table carries a `tenantId`, and cross-tenant
access is rejected in `lib/permissions/scope.ts` before any policy check runs —
it isn't treated as a permission question at all.

**Permissions are pure functions.** `lib/permissions/index.ts` has no database or
request access; it's a function of `(actor, target)`. Services load the relational
context a decision needs (is this me? is this person in my downline?) and pass it
in. That's what makes the policy layer exhaustively unit-testable.

**One module per folder.** Each module under `lib/modules/` owns its service layer
and Zod schemas. Cross-module access goes through service functions, never by
reaching into another module's tables.

**Config over hardcode.** Employment types, document categories, leave types and
departments are rows, not enums baked into the code.

**A candidate is not an employee.** `Candidate` and `Employee` are separate
tables with separate lifecycles — a candidate has no login, no manager and no
leave. The only bridge between them is hiring an application, which creates the
employee record and stores the link. Nothing else in the app needs to know that
an employee was once a candidate.

**Leave balances are never a stored number.** Every grant, accrual, booking and
refund is a row in `LeaveLedgerEntry`, and a balance is the sum of those rows for
a type and year. Cancelling approved leave writes a compensating refund rather
than deleting the booking, so the trail shows the days going out and coming back.
Day counts are computed once at submission and frozen — adding a public holiday
later never silently revalues leave someone has already taken.

## Getting started

Requires Node 20+. No Docker needed — `db:start` provisions a local Postgres
cluster via `embedded-postgres`.

```bash
npm install
cp .env.example .env      # defaults work as-is for local dev
npm run db:start          # local Postgres on port 5433
npm run db:migrate
npm run db:seed           # demo tenant with sample employees
npm run dev
```

App runs at http://localhost:3000.

The seed builds a demo company — 15 people across three departments, with real
reporting lines — and prints its logins. All share the password
`DemoPassword123!`. Signing in as each shows how differently the same app
behaves per role:

| Sign in as | To see |
|---|---|
| `priya.raman@northwind.test` | HR administrator — every profile, settings, the audit log |
| `marcus.oyelaran@northwind.test` | Manager — his engineering downline, and their leave requests to approve |
| `raj.deshmukh@northwind.test` | Employee — the directory, his own file, booking his own leave |

`AUTH_SECRET` in `.env` needs a real value before deploying anywhere — generate
one with `npx auth secret`.

## Scripts

| | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` / `start` | production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | unit tests (Vitest) |
| `npm run test:e2e` | end-to-end tests (Playwright) |
| `npm run db:start` / `db:stop` | local Postgres |
| `npm run db:migrate` | apply migrations |
| `npm run db:seed` | seed demo data |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset` | drop, re-migrate, re-seed |

## Testing

Unit tests cover the permission matrix and the leave day arithmetic — both are
dependency-free, so every role/target combination and every calendar edge (half
days, weekends, holidays, mid-year joiners) can be asserted directly.

Playwright covers the journeys end to end: signing up and onboarding an employee
by invite, HR editing a record and the change reaching the audit log, the org
chart reflecting reporting lines, and booking leave through to a manager
approving it. A dedicated permissions suite checks that the rules hold against
the real API, not just the UI — that an employee cannot read a colleague's
private data, that self-service editing stays inside its allow-list, that one
tenant's records are invisible to another's administrator, and that nobody can
approve their own leave.

```bash
npm test
npm run test:e2e
```

## Layout

```
app/
  (auth)/         login, signup, invite acceptance, password reset
  (dashboard)/    authenticated shell
    people/       directory and profiles
    org/          departments and org chart
    documents/    document management
    leave/        balances, booking, approval inbox
    time/         weekly timesheet, clock, approval inbox
    tasks/        checklist steps waiting on you
    recruiting/   job postings and candidate pipelines
    settings/     tenant, roles, config lists, leave, checklists, audit log
  api/            route handlers
lib/
  auth/           session and credentials config
  db/             Prisma client singleton
  modules/        one folder per module, self-contained
  permissions/    policy definitions and tenant scoping
  validation/     shared Zod schemas
prisma/           schema, migrations, seed
tests/            unit and e2e
```

## Status

Phases 1 and 2 are complete: core HR, leave, time & attendance, onboarding and
offboarding checklists, and recruitment. Phase 3 onwards — performance reviews,
learning, compensation, analytics — is specced in `HR-Platform-Spec.md` but not
built.

Known limits, all deliberate rather than overlooked:

- **A Mon–Fri working week and a calendar leave year are hardcoded**
  (`WEEKEND` in `lib/modules/leave/calendar.ts`). Configurable working weeks and
  April-start leave years are a schema change on `Tenant`, not a rewrite.
- **`carryOverMaxDays` is stored but not acted on.** There is no year-rollover
  job; deciding forfeit-versus-carry rules is a policy call.
- **Leave accrual is derived on read** rather than written by a scheduled job,
  so balances are correct without anything running overnight.
- **Interview outcomes are recorded but do not move the pipeline** on their own —
  advancing a candidate stays a deliberate act.
- **No candidate-facing careers page or portal.** Applications are entered by HR
  or the hiring manager.
