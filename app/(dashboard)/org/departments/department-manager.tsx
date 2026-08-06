"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import type { DepartmentNode } from "@/lib/modules/org/service";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Select } from "@/components/ui";

interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
}

export function DepartmentManager({
  tree,
  employees,
  canManage,
}: {
  tree: DepartmentNode[];
  employees: EmployeeOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const flat = flatten(tree);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = event.currentTarget;
    try {
      await apiFetch("/api/departments", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries())),
      });
      form.reset();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the department.");
    } finally {
      setPending(false);
    }
  }

  async function update(id: string, payload: Record<string, string | null>) {
    setError(null);
    try {
      await apiFetch(`/api/departments/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setEditing(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the department.");
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete the "${name}" department?`)) return;
    setError(null);
    try {
      await apiFetch(`/api/departments/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the department.");
    }
  }

  return (
    <div className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}

      {canManage ? (
        <Card>
          <CardHeader title="Add a department" />
          <form onSubmit={create} className="grid gap-4 px-5 py-4 sm:grid-cols-3">
            <Field label="Name" htmlFor="name">
              <Input id="name" name="name" required />
            </Field>
            <Field label="Parent department" htmlFor="parentId">
              <Select id="parentId" name="parentId" defaultValue="">
                <option value="">Top level</option>
                {flat.map((department) => (
                  <option key={department.id} value={department.id}>
                    {"— ".repeat(department.depth)}
                    {department.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Lead" htmlFor="leadId">
              <Select id="leadId" name="leadId" defaultValue="">
                <option value="">No lead</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.firstName} {employee.lastName}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-3">
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Add department"}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Structure" description={`${flat.length} departments`} />
        {flat.length === 0 ? (
          <EmptyState title="No departments yet" hint={canManage ? "Create one above." : undefined} />
        ) : (
          <ul className="divide-y divide-[--color-line]">
            {flat.map((department) => (
              <li key={department.id} className="px-5 py-3">
                {editing === department.id ? (
                  <EditRow
                    department={department}
                    options={flat.filter((candidate) => candidate.id !== department.id)}
                    employees={employees}
                    onCancel={() => setEditing(null)}
                    onSave={(payload) => update(department.id, payload)}
                  />
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div style={{ paddingLeft: department.depth * 20 }}>
                      <p className="text-sm font-medium">{department.name}</p>
                      <p className="text-xs text-[--color-muted]">
                        {department.lead ? (
                          <>
                            Led by{" "}
                            <Link href={`/people/${department.lead.id}`} className="hover:underline">
                              {department.lead.firstName} {department.lead.lastName}
                            </Link>
                          </>
                        ) : (
                          "No lead"
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge>{department.memberCount} members</Badge>
                      {canManage ? (
                        <>
                          <Button variant="ghost" onClick={() => setEditing(department.id)}>
                            Edit
                          </Button>
                          <Button variant="ghost" onClick={() => remove(department.id, department.name)}>
                            Delete
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function EditRow({
  department,
  options,
  employees,
  onCancel,
  onSave,
}: {
  department: FlatDepartment;
  options: FlatDepartment[];
  employees: EmployeeOption[];
  onCancel: () => void;
  onSave: (payload: Record<string, string | null>) => void;
}) {
  return (
    <form
      className="grid gap-3 sm:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onSave({
          name: String(form.get("name")),
          parentId: (form.get("parentId") as string) || null,
          leadId: (form.get("leadId") as string) || null,
        });
      }}
    >
      <Field label="Name" htmlFor={`name-${department.id}`}>
        <Input id={`name-${department.id}`} name="name" defaultValue={department.name} required />
      </Field>
      <Field label="Parent" htmlFor={`parent-${department.id}`}>
        <Select id={`parent-${department.id}`} name="parentId" defaultValue={department.parentId ?? ""}>
          <option value="">Top level</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Lead" htmlFor={`lead-${department.id}`}>
        <Select id={`lead-${department.id}`} name="leadId" defaultValue={department.leadId ?? ""}>
          <option value="">No lead</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.firstName} {employee.lastName}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex items-end gap-2">
        <Button type="submit">Save</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

interface FlatDepartment extends Omit<DepartmentNode, "children"> {
  depth: number;
}

/** Depth-first flatten so nesting can be shown as indentation in a flat list. */
function flatten(nodes: DepartmentNode[], depth = 0): FlatDepartment[] {
  return nodes.flatMap((node) => {
    const { children, ...rest } = node;
    return [{ ...rest, depth }, ...flatten(children, depth + 1)];
  });
}
