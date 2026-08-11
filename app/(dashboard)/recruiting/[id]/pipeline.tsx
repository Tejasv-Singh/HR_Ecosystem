"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarPlus, UserPlus } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";

const STAGES = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED"] as const;
const STAGE_LABEL: Record<string, string> = {
  APPLIED: "Applied",
  SCREENING: "Screening",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  HIRED: "Hired",
  REJECTED: "Rejected",
};

interface InterviewRow {
  id: string;
  scheduledAt: string;
  stageName: string | null;
  outcome: string;
  interviewerName: string | null;
}

interface ApplicationRow {
  id: string;
  stage: string;
  rejectedReason: string | null;
  hiredEmployeeId: string | null;
  candidate: { id: string; name: string; email: string; source: string | null };
  interviews: InterviewRow[];
}

export function Pipeline({
  postingId,
  applications,
  canHire,
  onboardingTemplates,
  interviewers,
}: {
  postingId: string;
  applications: ApplicationRow[];
  canHire: boolean;
  onboardingTemplates: { id: string; name: string }[];
  interviewers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [scheduling, setScheduling] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function move(application: ApplicationRow, stage: string) {
    if (stage === "REJECTED") {
      const reason = window.prompt(`Why is ${application.candidate.name} being rejected?`);
      if (reason === null) return;
      return run(() =>
        apiFetch(`/api/recruiting/applications/${application.id}`, {
          method: "PATCH",
          body: JSON.stringify({ stage, reason }),
        }),
      );
    }

    if (stage === "HIRED") {
      const startDate = window.prompt(`Start date for ${application.candidate.name}? (YYYY-MM-DD)`);
      if (!startDate) return;
      const templateId =
        onboardingTemplates.length > 0 && window.confirm(`Start the "${onboardingTemplates[0].name}" checklist?`)
          ? onboardingTemplates[0].id
          : undefined;
      return run(() =>
        apiFetch(`/api/recruiting/applications/${application.id}`, {
          method: "PATCH",
          body: JSON.stringify({ stage, startDate, onboardingTemplateId: templateId }),
        }),
      );
    }

    return run(() =>
      apiFetch(`/api/recruiting/applications/${application.id}`, {
        method: "PATCH",
        body: JSON.stringify({ stage }),
      }),
    );
  }

  const rejected = applications.filter((application) => application.stage === "REJECTED");

  return (
    <div className="space-y-5">
      {error ? <Alert>{error}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-5">
        {STAGES.map((stage) => {
          const inStage = applications.filter((application) => application.stage === stage);
          return (
            <Card key={stage} className="flex flex-col">
              <div className="flex items-center justify-between border-b border-[--color-line] px-4 py-2.5">
                <span className="text-sm font-semibold">{STAGE_LABEL[stage]}</span>
                <span className="text-xs text-[--color-muted]">{inStage.length}</span>
              </div>

              <ul className="flex-1 space-y-2 p-3">
                {inStage.length === 0 ? (
                  <li className="py-4 text-center text-xs text-[--color-muted]">—</li>
                ) : (
                  inStage.map((application) => (
                    <li key={application.id} className="rounded-lg border border-[--color-line] p-2.5">
                      <p className="text-sm font-medium">{application.candidate.name}</p>
                      <p className="truncate text-xs text-[--color-muted]" title={application.candidate.email}>
                        {application.candidate.email}
                      </p>

                      {application.interviews.length > 0 ? (
                        <p className="mt-1 text-xs text-[--color-muted]">
                          {application.interviews.length} interview{application.interviews.length === 1 ? "" : "s"}
                          {application.interviews.some((interview) => interview.outcome === "ADVANCE") ? " · advanced" : ""}
                        </p>
                      ) : null}

                      {application.hiredEmployeeId ? (
                        <Link
                          href={`/people/${application.hiredEmployeeId}`}
                          className="mt-1 block text-xs text-[--color-brand] hover:underline"
                        >
                          View employee record →
                        </Link>
                      ) : null}

                      {stage !== "HIRED" ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Select
                            aria-label={`Move ${application.candidate.name}`}
                            className="h-8 flex-1 py-1 text-xs"
                            value=""
                            disabled={busy}
                            onChange={(event) => {
                              if (event.target.value) void move(application, event.target.value);
                            }}
                          >
                            <option value="">Move to…</option>
                            {STAGES.filter((option) => option !== stage)
                              .filter((option) => option !== "APPLIED")
                              .filter((option) => option !== "HIRED" || canHire)
                              .map((option) => (
                                <option key={option} value={option}>
                                  {STAGE_LABEL[option]}
                                </option>
                              ))}
                            <option value="REJECTED">Reject</option>
                          </Select>

                          <Button
                            variant="ghost"
                            className="h-8 px-2"
                            aria-label={`Schedule an interview with ${application.candidate.name}`}
                            onClick={() => setScheduling(scheduling === application.id ? null : application.id)}
                          >
                            <CalendarPlus size={14} />
                          </Button>
                        </div>
                      ) : null}

                      {scheduling === application.id ? (
                        <InterviewForm
                          applicationId={application.id}
                          interviewers={interviewers}
                          busy={busy}
                          onDone={() => setScheduling(null)}
                          run={run}
                        />
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
            </Card>
          );
        })}
      </div>

      {rejected.length > 0 ? (
        <Card>
          <CardHeader title="Rejected" description={`${rejected.length} candidate${rejected.length === 1 ? "" : "s"}`} />
          <ul className="divide-y divide-[--color-line]">
            {rejected.map((application) => (
              <li key={application.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-sm">
                <span className="font-medium">{application.candidate.name}</span>
                <span className="text-[--color-muted]">{application.candidate.email}</span>
                {application.rejectedReason ? (
                  <span className="ml-auto text-xs text-[--color-muted]">“{application.rejectedReason}”</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Add a candidate"
          action={
            <Button variant="secondary" onClick={() => setAdding(!adding)}>
              <UserPlus size={14} /> {adding ? "Close" : "Add"}
            </Button>
          }
        />
        {adding ? <CandidateForm postingId={postingId} busy={busy} onDone={() => setAdding(false)} run={run} /> : null}
      </Card>
    </div>
  );
}

function CandidateForm({
  postingId,
  busy,
  onDone,
  run,
}: {
  postingId: string;
  busy: boolean;
  onDone: () => void;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <form
      className="grid gap-3 px-5 py-4 sm:grid-cols-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = Object.fromEntries(new FormData(form).entries());
        await run(async () => {
          await apiFetch("/api/recruiting/applications", {
            method: "POST",
            body: JSON.stringify({ postingId, candidate: data }),
          });
          form.reset();
          onDone();
        });
      }}
    >
      <Field label="First name" htmlFor="firstName">
        <Input id="firstName" name="firstName" required />
      </Field>
      <Field label="Last name" htmlFor="lastName">
        <Input id="lastName" name="lastName" required />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" required />
      </Field>
      <Field label="Source" htmlFor="source" hint="Referral, job board…">
        <Input id="source" name="source" />
      </Field>
      <div className="sm:col-span-4">
        <Button type="submit" disabled={busy}>
          Add to pipeline
        </Button>
      </div>
    </form>
  );
}

function InterviewForm({
  applicationId,
  interviewers,
  busy,
  onDone,
  run,
}: {
  applicationId: string;
  interviewers: { id: string; name: string }[];
  busy: boolean;
  onDone: () => void;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [when, setWhen] = useState("");
  const [interviewerId, setInterviewerId] = useState("");

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-[--color-canvas] p-2">
      <Input
        type="datetime-local"
        aria-label="Interview date and time"
        className="h-8 py-1 text-xs"
        value={when}
        onChange={(event) => setWhen(event.target.value)}
      />
      <Select
        aria-label="Interviewer"
        className="h-8 py-1 text-xs"
        value={interviewerId}
        onChange={(event) => setInterviewerId(event.target.value)}
      >
        <option value="">Interviewer…</option>
        {interviewers.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </Select>
      <Button
        className="h-8 w-full text-xs"
        disabled={busy || !when}
        onClick={() =>
          run(async () => {
            await apiFetch("/api/recruiting/interviews", {
              method: "POST",
              body: JSON.stringify({ applicationId, scheduledAt: when, interviewerId: interviewerId || undefined }),
            });
            onDone();
          })
        }
      >
        Schedule
      </Button>
    </div>
  );
}
