/**
 * Accounts module — tenant sign-up, invitations and password reset.
 *
 * Token handling rule for the whole module: the raw token exists only in the
 * emailed link. The database stores its SHA-256 hash, and lookups hash the
 * incoming token before querying.
 */
import { generateToken, hashPassword, hashToken } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { appUrl, sendEmail } from "@/lib/email";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { recordAudit } from "@/lib/modules/audit/service";
import type { AcceptInviteInput, InviteCreateInput, ResetPasswordInput, SignupInput } from "@/lib/modules/accounts/schemas";
import { assertCan, assertSameTenant, type Actor } from "@/lib/permissions";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

const DEFAULT_EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contractor", "Intern"];
const DEFAULT_DOCUMENT_CATEGORIES: { name: string; requiresExpiry: boolean }[] = [
  { name: "Contract", requiresExpiry: false },
  { name: "Identification", requiresExpiry: true },
  { name: "Right to work", requiresExpiry: true },
  { name: "Certification", requiresExpiry: true },
  { name: "Payroll", requiresExpiry: false },
  { name: "Other", requiresExpiry: false },
];

/**
 * Sign-up creates the tenant, its first administrator, that person's Employee
 * record, and a starter set of configuration — all in one transaction, so a
 * half-built tenant can never exist.
 */
export async function signup(input: SignupInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw new ConflictError("An account with that email already exists.");

  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: input.organizationName,
        countryCode: input.countryCode,
        employmentTypes: { create: DEFAULT_EMPLOYMENT_TYPES.map((name) => ({ name })) },
        documentCategories: { create: DEFAULT_DOCUMENT_CATEGORIES },
      },
    });

    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: input.email,
        passwordHash,
        role: "HR_ADMIN",
        status: "ACTIVE",
      },
    });

    const employee = await tx.employee.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        firstName: input.firstName,
        lastName: input.lastName,
        workEmail: input.email,
        jobTitle: "HR Administrator",
        status: "ACTIVE",
        startDate: new Date(),
      },
    });

    await recordAudit(tx, {
      actor: { userId: user.id, tenantId: tenant.id, email: user.email },
      action: "CREATE",
      entityType: "Tenant",
      entityId: tenant.id,
      summary: `Created organisation ${tenant.name}`,
    });

    return { tenant, user, employee };
  });
}

// --- invites ---------------------------------------------------------------

export async function listPendingInvites(actor: Actor) {
  assertCan(actor, "invite:manage");
  return prisma.invite.findMany({
    where: { tenantId: actor.tenantId, acceptedAt: null, revokedAt: null },
    select: {
      id: true,
      email: true,
      expiresAt: true,
      createdAt: true,
      employee: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Invite an existing employee to claim a login. Creates the pending `User` if
 * the employee does not have one yet, then emails a single-use link.
 */
export async function createInvite(actor: Actor, input: InviteCreateInput) {
  assertCan(actor, "invite:manage");

  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, tenantId: true, firstName: true, lastName: true, workEmail: true, userId: true },
  });
  if (!employee) throw new NotFoundError("Employee not found.");
  assertSameTenant(actor, employee.tenantId);

  if (employee.userId) {
    const user = await prisma.user.findUnique({ where: { id: employee.userId }, select: { status: true } });
    if (user?.status === "ACTIVE") throw new ConflictError("That employee already has an active login.");
  } else {
    const emailTaken = await prisma.user.findUnique({ where: { email: employee.workEmail }, select: { id: true } });
    if (emailTaken) throw new ConflictError("Another account already uses that email address.");
  }

  const { token, tokenHash } = generateToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  const invite = await prisma.$transaction(async (tx) => {
    const userId =
      employee.userId ??
      (
        await tx.user.create({
          data: {
            tenantId: actor.tenantId,
            email: employee.workEmail,
            role: input.role,
            status: "PENDING",
          },
          select: { id: true },
        })
      ).id;

    if (!employee.userId) {
      await tx.employee.update({ where: { id: employee.id }, data: { userId } });
    } else {
      await tx.user.update({ where: { id: userId }, data: { role: input.role } });
    }

    // Supersede any earlier outstanding invite for this person.
    await tx.invite.updateMany({
      where: { employeeId: employee.id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const created = await tx.invite.create({
      data: {
        tenantId: actor.tenantId,
        employeeId: employee.id,
        email: employee.workEmail,
        tokenHash,
        expiresAt,
        invitedBy: actor.userId,
      },
    });

    await recordAudit(tx, {
      actor,
      action: "INVITE",
      entityType: "Employee",
      entityId: employee.id,
      summary: `Invited ${employee.firstName} ${employee.lastName} (${employee.workEmail}) as ${input.role}`,
    });

    return created;
  });

  const link = appUrl(`/invite/${token}`);
  await sendEmail({
    to: employee.workEmail,
    subject: "You have been invited to the HR platform",
    text: [
      `Hi ${employee.firstName},`,
      "",
      "You have been invited to set up your account on the HR platform.",
      "Set your password using the link below. It expires in 7 days.",
      "",
      link,
    ].join("\n"),
  });

  // The raw token is returned so tests and the console driver can follow the
  // link; it is never persisted.
  return { invite, token, link };
}

export async function revokeInvite(actor: Actor, inviteId: string) {
  assertCan(actor, "invite:manage");

  const invite = await prisma.invite.findUnique({ where: { id: inviteId }, select: { id: true, tenantId: true, email: true } });
  if (!invite) throw new NotFoundError("Invite not found.");
  assertSameTenant(actor, invite.tenantId);

  await prisma.$transaction(async (tx) => {
    await tx.invite.update({ where: { id: inviteId }, data: { revokedAt: new Date() } });
    await recordAudit(tx, {
      actor,
      action: "UPDATE",
      entityType: "Invite",
      entityId: inviteId,
      summary: `Revoked invite for ${invite.email}`,
    });
  });
}

/** Look up an invite for the acceptance screen, without consuming it. */
export async function getInviteByToken(token: string) {
  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      email: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      employee: { select: { firstName: true, lastName: true } },
      tenant: { select: { name: true } },
    },
  });

  if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt < new Date()) return null;
  return invite;
}

export async function acceptInvite(input: AcceptInviteInput) {
  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hashToken(input.token) },
    select: {
      id: true,
      tenantId: true,
      employeeId: true,
      email: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      employee: { select: { id: true, userId: true } },
    },
  });

  if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt < new Date()) {
    throw new ValidationError("That invitation link is no longer valid. Ask an administrator for a new one.");
  }
  if (!invite.employee.userId) {
    throw new ValidationError("That invitation is incomplete. Ask an administrator to send a new one.");
  }

  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: invite.employee.userId! },
      data: { passwordHash, status: "ACTIVE" },
      select: { id: true, email: true, tenantId: true },
    });

    await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });

    await recordAudit(tx, {
      actor: { userId: user.id, tenantId: user.tenantId, email: user.email },
      action: "UPDATE",
      entityType: "User",
      entityId: user.id,
      summary: "Accepted invitation and set a password",
    });

    return user;
  });
}

// --- password reset --------------------------------------------------------

/**
 * Always resolves successfully, whether or not the address is known — otherwise
 * this endpoint becomes an account-enumeration oracle.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, status: true, email: true } });
  if (!user || user.status === "DISABLED") return;

  const { token, tokenHash } = generateToken();
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });

  await sendEmail({
    to: user.email,
    subject: "Reset your HR platform password",
    text: [
      "We received a request to reset your password.",
      "Use the link below within the next hour. If this was not you, ignore this message.",
      "",
      appUrl(`/reset-password/${token}`),
    ].join("\n"),
  });
}

export async function isResetTokenValid(token: string): Promise<boolean> {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { expiresAt: true, usedAt: true },
  });
  return Boolean(record && !record.usedAt && record.expiresAt > new Date());
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(input.token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true, user: { select: { id: true, email: true, tenantId: true } } },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new ValidationError("That reset link is no longer valid. Request a new one.");
  }

  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash, status: "ACTIVE" },
    });
    await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    // Invalidate any other outstanding reset tokens for this account.
    await tx.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    await recordAudit(tx, {
      actor: { userId: record.user.id, tenantId: record.user.tenantId, email: record.user.email },
      action: "PASSWORD_RESET",
      entityType: "User",
      entityId: record.userId,
      summary: "Password reset completed",
    });
  });
}
