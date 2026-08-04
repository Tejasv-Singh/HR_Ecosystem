"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { Alert, Button, Card, CardHeader, EmptyState, Field, Input } from "@/components/ui";

interface Contact {
  id: string;
  name: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
}

export function EmergencyContacts({
  employeeId,
  contacts,
  canEdit,
}: {
  employeeId: string;
  contacts: Contact[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    try {
      await apiFetch(`/api/employees/${employeeId}/emergency-contacts`, {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      setAdding(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add the contact.");
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await apiFetch(`/api/emergency-contacts/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove the contact.");
    }
  }

  return (
    <Card>
      <CardHeader
        title="Emergency contacts"
        action={
          canEdit && !adding ? (
            <Button variant="secondary" onClick={() => setAdding(true)}>
              Add
            </Button>
          ) : undefined
        }
      />

      {error ? (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {adding ? (
        <form onSubmit={add} className="space-y-3 border-b border-[--color-line] px-5 py-4">
          <Field label="Name" htmlFor="contact-name">
            <Input id="contact-name" name="name" required autoFocus />
          </Field>
          <Field label="Relationship" htmlFor="contact-relationship">
            <Input id="contact-relationship" name="relationship" placeholder="Partner, parent…" />
          </Field>
          <Field label="Phone" htmlFor="contact-phone">
            <Input id="contact-phone" name="phone" />
          </Field>
          <Field label="Email" htmlFor="contact-email">
            <Input id="contact-email" name="email" type="email" />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save contact"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {contacts.length === 0 && !adding ? (
        <EmptyState title="No emergency contacts" hint={canEdit ? "Add someone to contact in an emergency." : undefined} />
      ) : (
        <ul className="divide-y divide-[--color-line]">
          {contacts.map((contact) => (
            <li key={contact.id} className="flex items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{contact.name}</p>
                <p className="text-xs text-[--color-muted]">
                  {[contact.relationship, contact.phone, contact.email].filter(Boolean).join(" · ") || "No details"}
                </p>
              </div>
              {canEdit ? (
                <Button variant="ghost" onClick={() => remove(contact.id)} aria-label={`Remove ${contact.name}`}>
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
