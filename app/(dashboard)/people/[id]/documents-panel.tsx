"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Select, formatBytes, formatDate } from "@/components/ui";

interface DocumentRow {
  id: string;
  fileName: string;
  sizeBytes: number;
  expiresAt: Date | string | null;
  createdAt: Date | string;
  category: { id: string; name: string };
}

interface Category {
  id: string;
  name: string;
  requiresExpiry: boolean;
}

export function DocumentsPanel({
  employeeId,
  documents,
  canManage,
}: {
  employeeId: string;
  documents: DocumentRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Categories are tenant configuration, so they are fetched rather than
  // hardcoded (spec §1: config over hardcode).
  useEffect(() => {
    if (!canManage) return;
    apiFetch<Category[]>("/api/document-categories")
      .then((result) => {
        setCategories(result);
        setCategoryId((current) => current || result[0]?.id || "");
      })
      .catch(() => setError("Could not load document categories."));
  }, [canManage]);

  const selected = categories.find((category) => category.id === categoryId);

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    form.set("employeeId", employeeId);

    try {
      await apiFetch("/api/documents", { method: "POST", body: form });
      formRef.current?.reset();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not upload the file.");
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string, fileName: string) {
    if (!window.confirm(`Delete "${fileName}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await apiFetch(`/api/documents/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the document.");
    }
  }

  return (
    <Card>
      <CardHeader title="Documents" description={`${documents.length} on file`} />

      {error ? (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {canManage ? (
        <form ref={formRef} onSubmit={upload} className="grid gap-3 border-b border-[--color-line] px-5 py-4 sm:grid-cols-3">
          <Field label="Category" htmlFor="categoryId">
            <Select id="categoryId" name="categoryId" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>
              {categories.length === 0 ? <option value="">Loading…</option> : null}
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Expiry date" htmlFor="expiresAt" hint={selected?.requiresExpiry ? "Required for this category." : "Optional."}>
            <Input id="expiresAt" name="expiresAt" type="date" required={selected?.requiresExpiry} />
          </Field>

          <Field label="File" htmlFor="file">
            <Input id="file" name="file" type="file" required />
          </Field>

          <div className="sm:col-span-3">
            <Button type="submit" disabled={pending || categories.length === 0}>
              {pending ? "Uploading…" : "Upload document"}
            </Button>
          </div>
        </form>
      ) : null}

      {documents.length === 0 ? (
        <EmptyState title="No documents" hint={canManage ? "Upload a contract, ID or certification." : undefined} />
      ) : (
        <ul className="divide-y divide-[--color-line]">
          {documents.map((document) => (
            <li key={document.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <a
                  href={`/api/documents/${document.id}/download`}
                  className="text-sm font-medium text-[--color-brand] hover:underline"
                >
                  {document.fileName}
                </a>
                <p className="mt-0.5 text-xs text-[--color-muted]">
                  {document.category.name} · {formatBytes(document.sizeBytes)} · uploaded {formatDate(document.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ExpiryBadge expiresAt={document.expiresAt} />
                {canManage ? (
                  <Button variant="ghost" onClick={() => remove(document.id, document.fileName)}>
                    Delete
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ExpiryBadge({ expiresAt }: { expiresAt: Date | string | null }) {
  if (!expiresAt) return null;

  const date = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  const daysLeft = Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

  if (daysLeft < 0) return <Badge tone="danger">Expired {formatDate(date)}</Badge>;
  if (daysLeft <= 30) return <Badge tone="warn">Expires {formatDate(date)}</Badge>;
  return <Badge tone="neutral">Expires {formatDate(date)}</Badge>;
}
