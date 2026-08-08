"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { Alert, Button, Card, CardHeader, EmptyState, Table, Td, Th, formatDate } from "@/components/ui";

interface Invite {
  id: string;
  email: string;
  expiresAt: Date | string;
  createdAt: Date | string;
  employee: { id: string; firstName: string; lastName: string };
}

export function PendingInvites({ invites }: { invites: Invite[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function revoke(id: string, email: string) {
    if (!window.confirm(`Revoke the invitation sent to ${email}?`)) return;
    setError(null);
    try {
      await apiFetch(`/api/invites/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not revoke the invitation.");
    }
  }

  return (
    <Card>
      <CardHeader
        title="Pending invitations"
        description="Invitations that have not been accepted yet. Send new ones from an employee's profile."
      />

      {error ? (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {invites.length === 0 ? (
        <EmptyState title="No pending invitations" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Person</Th>
              <Th>Email</Th>
              <Th>Sent</Th>
              <Th>Expires</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {invites.map((invite) => (
              <tr key={invite.id}>
                <Td>
                  <Link href={`/people/${invite.employee.id}`} className="font-medium hover:underline">
                    {invite.employee.firstName} {invite.employee.lastName}
                  </Link>
                </Td>
                <Td>{invite.email}</Td>
                <Td>{formatDate(invite.createdAt)}</Td>
                <Td>{formatDate(invite.expiresAt)}</Td>
                <Td className="text-right">
                  <Button variant="ghost" onClick={() => revoke(invite.id, invite.email)}>
                    Revoke
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
