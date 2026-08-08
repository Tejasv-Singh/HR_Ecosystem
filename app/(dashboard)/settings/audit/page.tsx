import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { listAuditEntityTypes, listAuditLogs } from "@/lib/modules/audit/service";
import { AuditFilters } from "@/app/(dashboard)/settings/audit/audit-filters";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, Table, Td, Th, formatDateTime } from "@/components/ui";

export const metadata = { title: "Audit log · HR Platform" };

const ACTIONS = ["CREATE", "UPDATE", "DELETE", "LOGIN", "INVITE", "DOWNLOAD", "PASSWORD_RESET"];

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActor();
  const raw = await searchParams;

  const page = Number(first(raw.page) ?? 1) || 1;
  const entityType = first(raw.entityType);
  const action = first(raw.action);

  const [{ items, total, pageSize }, entityTypes] = await Promise.all([
    listAuditLogs(actor, { page, pageSize: 50, entityType, action }),
    listAuditEntityTypes(actor),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <PageHeader
        title="Audit log"
        description={`${total} recorded ${total === 1 ? "event" : "events"}`}
        action={
          <ButtonLink variant="secondary" href="/settings">
            Back to settings
          </ButtonLink>
        }
      />

      <AuditFilters entityTypes={entityTypes} actions={ACTIONS} />

      <Card className="mt-4">
        {items.length === 0 ? (
          <EmptyState title="No matching events" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>Action</Th>
                <Th>Entity</Th>
                <Th>Detail</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr key={entry.id} className="align-top">
                  <Td className="whitespace-nowrap">{formatDateTime(entry.createdAt)}</Td>
                  <Td>{entry.actorEmail ?? entry.actorId}</Td>
                  <Td>
                    <Badge tone={toneFor(entry.action)}>{entry.action}</Badge>
                  </Td>
                  <Td>
                    <span className="block">{entry.entityType}</span>
                    <span className="block font-mono text-xs text-[--color-muted]">{entry.entityId}</span>
                  </Td>
                  <Td>
                    <span className="block">{entry.summary ?? "—"}</span>
                    {entry.changes ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-[--color-muted]">Changes</summary>
                        <pre className="mt-1 max-w-md overflow-x-auto rounded bg-[--color-canvas] p-2 text-xs">
                          {JSON.stringify(entry.changes, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {totalPages > 1 ? (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
          <p className="text-[--color-muted]">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={hrefFor(raw, page - 1)} className="rounded-lg border border-[--color-line] bg-[--color-surface] px-3.5 py-2">
                Previous
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link href={hrefFor(raw, page + 1)} className="rounded-lg border border-[--color-line] bg-[--color-surface] px-3.5 py-2">
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </>
  );
}

function toneFor(action: string) {
  if (action === "DELETE") return "danger" as const;
  if (action === "CREATE") return "success" as const;
  if (action === "LOGIN" || action === "DOWNLOAD") return "neutral" as const;
  return "brand" as const;
}

function first(value: string | string[] | undefined): string | undefined {
  const result = Array.isArray(value) ? value[0] : value;
  return result === "" ? undefined : result;
}

function hrefFor(raw: Record<string, string | string[] | undefined>, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const single = first(value);
    if (single && key !== "page") params.set(key, single);
  }
  params.set("page", String(page));
  return `/settings/audit?${params.toString()}`;
}
