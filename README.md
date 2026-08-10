# HR Ecosystem

A multi-tenant HR platform built as a modular monolith. Phase 1 covers the core:
an employee directory, org structure, document management, and tenant settings —
all of it permission-aware and audited.

Built with Next.js (App Router), PostgreSQL + Prisma, Auth.js, Tailwind, and Zod.

## What's in it

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

Four roles: `SUPER_ADMIN`, `HR_ADMIN`, `MANAGER`, `EMPLOYEE`.

**One module per folder.** Each module under `lib/modules/` owns its service layer
and Zod schemas. Cross-module access goes through service functions, never by
reaching into another module's tables.

**Config over hardcode.** Employment types, document categories, leave types and
departments are rows, not enums baked into the code.

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

App runs at http://localhost:3000. Seed credentials are printed by `db:seed`.

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

Unit tests cover the permission matrix — the policy layer being dependency-free
means every role/target combination can be asserted directly. Playwright covers
a happy path (sign up, add an employee, upload a document) plus a suite that
checks the permission rules actually hold end to end.

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
    settings/     tenant, roles, config lists, leave setup, audit log
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

Phase 1 is complete. Phase 2 has started with leave management; time &
attendance, recruitment/ATS and onboarding checklists are specced in
`HR-Platform-Spec.md` but not built yet.

Leave currently assumes a Mon–Fri working week and a calendar leave year.
Accrual is derived on read rather than written by a scheduled job, so balances
are correct without anything having to run overnight — but there is no
carry-over rollover job yet, and `carryOverMaxDays` is stored and not yet acted
on.
