"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { Alert, Badge, Card, CardHeader, EmptyState, Select, Table, Td, Th, formatDateTime } from "@/components/ui";

interface TenantUser {
  id: string;
  email: string;
  role: string;
  status: string;
  lastLoginAt: Date | string | null;
  employee: { id: string; firstName: string; lastName: string } | null;
}

const ROLES = [
  { value: "HR_ADMIN", label: "HR administrator" },
  { value: "MANAGER", label: "Manager" },
  { value: "EMPLOYEE", label: "Employee" },
  { value: "SUPER_ADMIN", label: "Super administrator" },
];

export function UserRoles({ users, currentUserId }: { users: TenantUser[]; currentUserId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function changeRole(id: string, role: string) {
    setError(null);
    try {
      await apiFetch(`/api/settings/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change the role.");
      router.refresh(); // put the select back in sync with the server
    }
  }

  return (
    <Card>
      <CardHeader title="Access" description="Which login accounts exist and what they can do." />

      {error ? (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {users.length === 0 ? (
        <EmptyState title="No login accounts yet" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Person</Th>
              <Th>Email</Th>
              <Th>Status</Th>
              <Th>Last sign-in</Th>
              <Th>Role</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <Td>
                  {user.employee ? (
                    <Link href={`/people/${user.employee.id}`} className="font-medium hover:underline">
                      {user.employee.firstName} {user.employee.lastName}
                    </Link>
                  ) : (
                    <span className="text-[--color-muted]">No employee record</span>
                  )}
                </Td>
                <Td>{user.email}</Td>
                <Td>
                  <Badge tone={user.status === "ACTIVE" ? "success" : user.status === "PENDING" ? "warn" : "neutral"}>
                    {user.status === "PENDING" ? "Invite pending" : user.status === "ACTIVE" ? "Active" : "Disabled"}
                  </Badge>
                </Td>
                <Td>{formatDateTime(user.lastLoginAt)}</Td>
                <Td>
                  <Select
                    value={user.role}
                    onChange={(event) => changeRole(user.id, event.target.value)}
                    aria-label={`Role for ${user.email}`}
                    className="w-48"
                  >
                    {ROLES.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </Select>
                  {user.id === currentUserId ? (
                    <p className="mt-1 text-xs text-[--color-muted]">You cannot remove your own admin access.</p>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
