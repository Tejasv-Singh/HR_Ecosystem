"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { employeeStatusValues } from "@/lib/modules/people/schemas";
import { SELF_EDITABLE_EMPLOYEE_FIELDS } from "@/lib/permissions";
import { Alert, Button, Card, CardHeader, Field, Input, Select, Textarea, humanise, toDateInputValue } from "@/components/ui";

export interface EmployeeFormValues {
  id?: string;
  firstName?: string;
  lastName?: string;
  preferredName?: string | null;
  workEmail?: string;
  personalEmail?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  employeeNumber?: string | null;
  departmentId?: string | null;
  managerId?: string | null;
  employmentTypeId?: string | null;
  status?: string;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  location?: string | null;
  dateOfBirth?: Date | string | null;
  address?: string | null;
  bio?: string | null;
}

const SELF_FIELDS = new Set<string>(SELF_EDITABLE_EMPLOYEE_FIELDS);

/**
 * One form for create, HR edit and self-service edit.
 *
 * In `self` mode the privileged inputs are not merely disabled — they are not
 * rendered and not submitted, mirroring the server-side allow-list.
 */
export function EmployeeForm({
  mode,
  employee,
  departments,
  managers,
  employmentTypes,
}: {
  mode: "create" | "full" | "self";
  employee?: EmployeeFormValues;
  departments: { id: string; name: string }[];
  managers: { id: string; firstName: string; lastName: string }[];
  employmentTypes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const canEditAll = mode !== "self";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    if (!canEditAll) {
      for (const key of Object.keys(payload)) {
        if (!SELF_FIELDS.has(key)) delete payload[key];
      }
    }

    try {
      if (mode === "create") {
        const created = await apiFetch<{ id: string }>("/api/employees", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        router.push(`/people/${created.id}`);
      } else {
        await apiFetch(`/api/employees/${employee?.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        router.push(`/people/${employee?.id}`);
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the employee.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}

      {canEditAll ? (
        <Card>
          <CardHeader title="Identity" />
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="firstName">
              <Input id="firstName" name="firstName" defaultValue={employee?.firstName ?? ""} required />
            </Field>
            <Field label="Last name" htmlFor="lastName">
              <Input id="lastName" name="lastName" defaultValue={employee?.lastName ?? ""} required />
            </Field>
            <Field label="Preferred name" htmlFor="preferredName">
              <Input id="preferredName" name="preferredName" defaultValue={employee?.preferredName ?? ""} />
            </Field>
            <Field label="Employee number" htmlFor="employeeNumber">
              <Input id="employeeNumber" name="employeeNumber" defaultValue={employee?.employeeNumber ?? ""} />
            </Field>
            <Field label="Work email" htmlFor="workEmail">
              <Input id="workEmail" name="workEmail" type="email" defaultValue={employee?.workEmail ?? ""} required />
            </Field>
          </div>
        </Card>
      ) : null}

      {canEditAll ? (
        <Card>
          <CardHeader title="Job" />
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
            <Field label="Job title" htmlFor="jobTitle">
              <Input id="jobTitle" name="jobTitle" defaultValue={employee?.jobTitle ?? ""} />
            </Field>
            <Field label="Department" htmlFor="departmentId">
              <Select id="departmentId" name="departmentId" defaultValue={employee?.departmentId ?? ""}>
                <option value="">No department</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Manager" htmlFor="managerId">
              <Select id="managerId" name="managerId" defaultValue={employee?.managerId ?? ""}>
                <option value="">No manager</option>
                {managers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.firstName} {manager.lastName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Employment type" htmlFor="employmentTypeId">
              <Select id="employmentTypeId" name="employmentTypeId" defaultValue={employee?.employmentTypeId ?? ""}>
                <option value="">Not set</option>
                {employmentTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status" htmlFor="status">
              <Select id="status" name="status" defaultValue={employee?.status ?? "ACTIVE"}>
                {employeeStatusValues.map((status) => (
                  <option key={status} value={status}>
                    {humanise(status)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Location" htmlFor="location">
              <Input id="location" name="location" defaultValue={employee?.location ?? ""} placeholder="London, Remote…" />
            </Field>
            <Field label="Start date" htmlFor="startDate">
              <Input id="startDate" name="startDate" type="date" defaultValue={toDateInputValue(employee?.startDate)} />
            </Field>
            <Field label="End date" htmlFor="endDate">
              <Input id="endDate" name="endDate" type="date" defaultValue={toDateInputValue(employee?.endDate)} />
            </Field>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Personal details"
          description={canEditAll ? undefined : "These are the fields you can maintain yourself."}
        />
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          {!canEditAll ? (
            <Field label="Preferred name" htmlFor="preferredName">
              <Input id="preferredName" name="preferredName" defaultValue={employee?.preferredName ?? ""} />
            </Field>
          ) : null}
          <Field label="Personal email" htmlFor="personalEmail">
            <Input id="personalEmail" name="personalEmail" type="email" defaultValue={employee?.personalEmail ?? ""} />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" defaultValue={employee?.phone ?? ""} />
          </Field>
          <Field label="Date of birth" htmlFor="dateOfBirth">
            <Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={toDateInputValue(employee?.dateOfBirth)} />
          </Field>
          <Field label="Address" htmlFor="address" className="sm:col-span-2">
            <Textarea id="address" name="address" defaultValue={employee?.address ?? ""} />
          </Field>
          <Field label="About" htmlFor="bio">
            <Textarea id="bio" name="bio" defaultValue={employee?.bio ?? ""} />
          </Field>
        </div>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Create employee" : "Save changes"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
