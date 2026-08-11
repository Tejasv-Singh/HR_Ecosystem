/**
 * Recruitment / ATS (Phase 2).
 *
 * The design point that matters: a Candidate is not an Employee. They are
 * separate tables with separate lifecycles, and the single bridge between them
 * is `moveApplication(..., "HIRED")`, which creates the Employee record and
 * stores the link on the application. Nothing else in the app has to know that
 * an employee was once a candidate.
 */
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { recordAudit } from "@/lib/modules/audit/service";
import { toUtcDate } from "@/lib/modules/leave/calendar";
import { assignChecklist } from "@/lib/modules/checklists/service";
import type {
  ApplicationInput,
  InterviewInput,
  InterviewOutcomeInput,
  PostingInput,
  PostingListQuery,
  StageMoveInput,
} from "@/lib/modules/recruiting/schemas";
import {
  assertCan,
  assertCanManagePostings,
  assertCanMoveApplication,
  assertCanViewPosting,
  assertSameTenant,
  canViewPosting,
  isAdmin,
  isValidStageTransition,
  type Actor,
  type ApplicationStageValue,
  type PostingTarget,
} from "@/lib/permissions";

/** Is this actor the hiring manager for that posting? */
function postingTargetFor(actor: Actor, posting: { tenantId: string; hiringManagerId: string | null }): PostingTarget {
  return {
    tenantId: posting.tenantId,
    isHiringManager: Boolean(actor.employeeId) && posting.hiringManagerId === actor.employeeId,
  };
}

// --- postings --------------------------------------------------------------

export async function listPostings(actor: Actor, query: PostingListQuery = {}) {
  assertCan(actor, "recruiting:read");

  const where: Prisma.JobPostingWhereInput = { tenantId: actor.tenantId };
  if (query.status) where.status = query.status;
  // A manager only ever sees their own reqs.
  if (!isAdmin(actor.role)) {
    if (!actor.employeeId) return [];
    where.hiringManagerId = actor.employeeId;
  }

  const postings = await prisma.jobPosting.findMany({
    where,
    include: {
      department: { select: { name: true } },
      hiringManager: { select: { id: true, firstName: true, lastName: true } },
      employmentType: { select: { name: true } },
      _count: { select: { applications: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  // Active pipeline size is more useful on a list than lifetime applications.
  const live = await prisma.application.groupBy({
    by: ["postingId"],
    where: { tenantId: actor.tenantId, stage: { notIn: ["HIRED", "REJECTED"] } },
    _count: { _all: true },
  });
  const liveByPosting = new Map(live.map((row) => [row.postingId, row._count._all]));

  return postings.map((posting) => ({
    ...posting,
    totalApplications: posting._count.applications,
    liveApplications: liveByPosting.get(posting.id) ?? 0,
  }));
}

export async function getPosting(actor: Actor, id: string) {
  assertCan(actor, "recruiting:read");

  const posting = await prisma.jobPosting.findUnique({
    where: { id },
    include: {
      department: { select: { id: true, name: true } },
      hiringManager: { select: { id: true, firstName: true, lastName: true } },
      employmentType: { select: { id: true, name: true } },
      applications: {
        include: {
          candidate: true,
          interviews: {
            include: { interviewer: { select: { firstName: true, lastName: true } } },
            orderBy: { scheduledAt: "asc" },
          },
        },
        orderBy: { appliedAt: "asc" },
      },
    },
  });
  if (!posting) throw new NotFoundError("Job posting not found.");
  assertSameTenant(actor, posting.tenantId);
  assertCanViewPosting(actor, postingTargetFor(actor, posting));

  return {
    ...posting,
    applications: posting.applications.map((application) => ({
      ...application,
      appliedAt: application.appliedAt.toISOString(),
      interviews: application.interviews.map((interview) => ({
        ...interview,
        scheduledAt: interview.scheduledAt.toISOString(),
        createdAt: interview.createdAt.toISOString(),
      })),
      candidate: {
        ...application.candidate,
        createdAt: application.candidate.createdAt.toISOString(),
        updatedAt: application.candidate.updatedAt.toISOString(),
      },
    })),
  };
}

export async function createPosting(actor: Actor, input: PostingInput) {
  assertCanManagePostings(actor);

  return prisma.$transaction(async (tx) => {
    const posting = await tx.jobPosting.create({ data: { ...input, tenantId: actor.tenantId } });
    await recordAudit(tx, {
      actor,
      action: "CREATE",
      entityType: "JobPosting",
      entityId: posting.id,
      summary: `Opened a req for ${posting.title}`,
    });
    return posting;
  });
}

export async function updatePosting(actor: Actor, id: string, input: PostingInput) {
  assertCanManagePostings(actor);

  const current = await prisma.jobPosting.findUnique({ where: { id }, select: { id: true, tenantId: true, status: true } });
  if (!current) throw new NotFoundError("Job posting not found.");
  assertSameTenant(actor, current.tenantId);

  return prisma.$transaction(async (tx) => {
    const posting = await tx.jobPosting.update({ where: { id }, data: input });
    await recordAudit(tx, {
      actor,
      action: "UPDATE",
      entityType: "JobPosting",
      entityId: id,
      summary: `Updated the ${posting.title} req`,
      ...(current.status !== posting.status
        ? { changes: { status: { from: current.status, to: posting.status } } }
        : {}),
    });
    return posting;
  });
}

export async function deletePosting(actor: Actor, id: string) {
  assertCanManagePostings(actor);

  const current = await prisma.jobPosting.findUnique({
    where: { id },
    select: { id: true, tenantId: true, title: true, _count: { select: { applications: true } } },
  });
  if (!current) throw new NotFoundError("Job posting not found.");
  assertSameTenant(actor, current.tenantId);
  if (current._count.applications > 0) {
    throw new ValidationError("That req has candidates against it. Close it instead of deleting it.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.jobPosting.delete({ where: { id } });
    await recordAudit(tx, {
      actor,
      action: "DELETE",
      entityType: "JobPosting",
      entityId: id,
      summary: `Removed the ${current.title} req`,
    });
  });
}

// --- candidates & applications ---------------------------------------------

export async function listCandidates(actor: Actor) {
  // Deliberately admin-only: a hiring manager sees candidates through their own
  // pipeline, not as a browsable database of everyone who ever applied.
  assertCan(actor, "recruiting:manage");
  return prisma.candidate.findMany({
    where: { tenantId: actor.tenantId },
    include: { applications: { select: { id: true, stage: true, posting: { select: { title: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function addApplication(actor: Actor, input: ApplicationInput) {
  assertCan(actor, "recruiting:read");

  const posting = await prisma.jobPosting.findUnique({ where: { id: input.postingId } });
  if (!posting) throw new NotFoundError("Job posting not found.");
  assertSameTenant(actor, posting.tenantId);
  assertCanViewPosting(actor, postingTargetFor(actor, posting));
  if (posting.status === "CLOSED") throw new ValidationError("That req is closed.");

  if (!input.candidateId && !input.candidate) {
    throw new ValidationError("Provide a candidate.");
  }

  return prisma.$transaction(async (tx) => {
    let candidateId = input.candidateId ?? null;

    if (!candidateId && input.candidate) {
      // Re-applying is normal; reuse the person rather than duplicating them.
      const existing = await tx.candidate.findUnique({
        where: { tenantId_email: { tenantId: actor.tenantId, email: input.candidate.email } },
        select: { id: true },
      });
      candidateId =
        existing?.id ??
        (await tx.candidate.create({ data: { ...input.candidate, tenantId: actor.tenantId } })).id;
    }

    if (!candidateId) throw new ValidationError("Provide a candidate.");

    const candidate = await tx.candidate.findUnique({ where: { id: candidateId } });
    if (!candidate) throw new NotFoundError("Candidate not found.");
    if (candidate.tenantId !== actor.tenantId) throw new NotFoundError("Candidate not found.");

    const duplicate = await tx.application.findUnique({
      where: { candidateId_postingId: { candidateId, postingId: posting.id } },
      select: { id: true },
    });
    if (duplicate) throw new ConflictError("That candidate is already in this pipeline.");

    const application = await tx.application.create({
      data: { tenantId: actor.tenantId, candidateId, postingId: posting.id },
      include: { candidate: true },
    });

    await recordAudit(tx, {
      actor,
      action: "CREATE",
      entityType: "Application",
      entityId: application.id,
      summary: `${candidate.firstName} ${candidate.lastName} added to ${posting.title}`,
    });

    return application;
  });
}

/**
 * Move an application through the pipeline.
 *
 * Hiring is the interesting branch: it creates the Employee, links it back to
 * the application, closes the req if every opening is filled, and optionally
 * starts an onboarding checklist — the point where recruitment hands over to
 * the rest of the platform.
 */
export async function moveApplication(actor: Actor, id: string, input: StageMoveInput) {
  const application = await prisma.application.findUnique({
    where: { id },
    include: { posting: true, candidate: true },
  });
  if (!application) throw new NotFoundError("Application not found.");
  assertSameTenant(actor, application.tenantId);

  const target = postingTargetFor(actor, application.posting);
  const from = application.stage as ApplicationStageValue;
  const to = input.stage;

  assertCanMoveApplication(actor, target, to);
  if (!isValidStageTransition(from, to)) {
    throw new ValidationError(`Cannot move from ${from.toLowerCase()} to ${to.toLowerCase()}.`);
  }
  if (to === "REJECTED" && !input.reason) {
    throw new ValidationError("Give a reason when rejecting a candidate.");
  }

  const hiredEmployee =
    to === "HIRED"
      ? await hireCandidate(actor, application, input)
      : null;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.application.update({
      where: { id },
      data: {
        stage: to,
        rejectedReason: to === "REJECTED" ? (input.reason ?? null) : null,
        ...(hiredEmployee ? { hiredEmployeeId: hiredEmployee.id } : {}),
      },
      include: { candidate: true, posting: true },
    });

    await recordAudit(tx, {
      actor,
      action: "UPDATE",
      entityType: "Application",
      entityId: id,
      summary: `${row.candidate.firstName} ${row.candidate.lastName} → ${to.toLowerCase()} on ${row.posting.title}`,
      changes: { stage: { from, to } },
    });

    // Close the req once every opening is filled.
    if (to === "HIRED") {
      const hires = await tx.application.count({ where: { postingId: row.postingId, stage: "HIRED" } });
      if (hires >= row.posting.openings) {
        await tx.jobPosting.update({ where: { id: row.postingId }, data: { status: "CLOSED" } });
      }
    }

    return row;
  });

  // Onboarding runs after the employee exists, and its failure must not undo
  // the hire — a missing checklist is a nuisance, an un-hired new joiner is not.
  if (hiredEmployee && input.onboardingTemplateId) {
    try {
      await assignChecklist(actor, {
        employeeId: hiredEmployee.id,
        templateId: input.onboardingTemplateId,
        anchorDate: input.startDate,
      });
    } catch (error) {
      console.error("Hired, but the onboarding checklist could not be started:", error);
    }
  }

  return { ...updated, hiredEmployeeId: hiredEmployee?.id ?? updated.hiredEmployeeId };
}

/** Create the employee record a hire produces. */
async function hireCandidate(
  actor: Actor,
  application: { id: string; tenantId: string; candidate: { firstName: string; lastName: string; email: string; phone: string | null }; posting: { title: string; departmentId: string | null; employmentTypeId: string | null; location: string | null; hiringManagerId: string | null } },
  input: StageMoveInput,
) {
  const { startDate } = input;
  if (!startDate) throw new ValidationError("A start date is required to hire someone.");

  const clash = await prisma.employee.findFirst({
    where: { tenantId: actor.tenantId, workEmail: application.candidate.email },
    select: { id: true },
  });
  if (clash) {
    throw new ConflictError("An employee already exists with that email address.");
  }

  return prisma.$transaction(async (tx) => {
    const employee = await tx.employee.create({
      data: {
        tenantId: actor.tenantId,
        firstName: application.candidate.firstName,
        lastName: application.candidate.lastName,
        workEmail: application.candidate.email,
        phone: application.candidate.phone,
        jobTitle: application.posting.title,
        departmentId: application.posting.departmentId,
        employmentTypeId: application.posting.employmentTypeId,
        location: application.posting.location,
        managerId: application.posting.hiringManagerId,
        startDate: toUtcDate(startDate),
        status: "ONBOARDING",
      },
    });

    await recordAudit(tx, {
      actor,
      action: "CREATE",
      entityType: "Employee",
      entityId: employee.id,
      summary: `Hired ${employee.firstName} ${employee.lastName} as ${employee.jobTitle}`,
    });

    return employee;
  });
}

// --- interviews ------------------------------------------------------------

export async function scheduleInterview(actor: Actor, input: InterviewInput) {
  assertCan(actor, "recruiting:read");

  const application = await prisma.application.findUnique({
    where: { id: input.applicationId },
    include: { posting: true, candidate: { select: { firstName: true, lastName: true } } },
  });
  if (!application) throw new NotFoundError("Application not found.");
  assertSameTenant(actor, application.tenantId);
  assertCanViewPosting(actor, postingTargetFor(actor, application.posting));

  const scheduledAt = new Date(input.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) throw new ValidationError("Pick a valid date and time.");

  return prisma.$transaction(async (tx) => {
    const interview = await tx.interview.create({
      data: {
        tenantId: actor.tenantId,
        applicationId: application.id,
        interviewerId: input.interviewerId ?? null,
        scheduledAt,
        minutes: input.minutes,
        stageName: input.stageName ?? null,
      },
    });
    await recordAudit(tx, {
      actor,
      action: "CREATE",
      entityType: "Interview",
      entityId: interview.id,
      summary: `Scheduled an interview with ${application.candidate.firstName} ${application.candidate.lastName}`,
    });
    return interview;
  });
}

export async function recordInterviewOutcome(actor: Actor, id: string, input: InterviewOutcomeInput) {
  assertCan(actor, "recruiting:read");

  const interview = await prisma.interview.findUnique({
    where: { id },
    include: { application: { include: { posting: true } } },
  });
  if (!interview) throw new NotFoundError("Interview not found.");
  assertSameTenant(actor, interview.tenantId);
  assertCanViewPosting(actor, postingTargetFor(actor, interview.application.posting));

  return prisma.$transaction(async (tx) => {
    const updated = await tx.interview.update({
      where: { id },
      data: { outcome: input.outcome, notes: input.notes ?? null },
    });
    await recordAudit(tx, {
      actor,
      action: "UPDATE",
      entityType: "Interview",
      entityId: id,
      summary: `Recorded interview outcome: ${input.outcome.toLowerCase()}`,
    });
    return updated;
  });
}

/** Interviews the actor is on the panel for, soonest first. */
export async function listMyInterviews(actor: Actor) {
  if (!actor.employeeId) return [];
  const interviews = await prisma.interview.findMany({
    where: {
      tenantId: actor.tenantId,
      interviewerId: actor.employeeId,
      outcome: "PENDING",
      scheduledAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) },
    },
    include: {
      application: {
        include: { candidate: { select: { firstName: true, lastName: true } }, posting: { select: { id: true, title: true, tenantId: true, hiringManagerId: true } } },
      },
    },
    orderBy: { scheduledAt: "asc" },
    take: 50,
  });

  // An interviewer may not be the hiring manager, so only surface the ones they
  // are actually allowed to open.
  return interviews
    .filter((interview) => canViewPosting(actor, postingTargetFor(actor, interview.application.posting)))
    .map((interview) => ({
      id: interview.id,
      scheduledAt: interview.scheduledAt.toISOString(),
      minutes: interview.minutes,
      stageName: interview.stageName,
      candidateName: `${interview.application.candidate.firstName} ${interview.application.candidate.lastName}`,
      postingId: interview.application.posting.id,
      postingTitle: interview.application.posting.title,
    }));
}
