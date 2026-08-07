import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { listExpiringDocuments } from "@/lib/modules/documents/service";
import { ExpiryBadge } from "@/app/(dashboard)/people/[id]/documents-panel";
import { Card, CardHeader, EmptyState, PageHeader, Table, Td, Th, formatBytes, formatDate } from "@/components/ui";

export const metadata = { title: "Documents · HR Platform" };

const WINDOW_DAYS = 60;

export default async function DocumentsPage() {
  const actor = await requireActor();
  const documents = await listExpiringDocuments(actor, WINDOW_DAYS);

  const now = Date.now();
  const expired = documents.filter((document) => document.expiresAt && document.expiresAt.getTime() < now);
  const expiring = documents.filter((document) => document.expiresAt && document.expiresAt.getTime() >= now);

  return (
    <>
      <PageHeader
        title="Documents"
        description={`Documents that have expired or will expire within ${WINDOW_DAYS} days. Upload files from an employee's profile.`}
      />

      <div className="space-y-4">
        <DocumentTable
          title="Expired"
          description="These need attention now."
          documents={expired}
          emptyMessage="Nothing has expired."
        />
        <DocumentTable
          title="Expiring soon"
          description={`Within the next ${WINDOW_DAYS} days.`}
          documents={expiring}
          emptyMessage="Nothing is expiring soon."
        />
      </div>
    </>
  );
}

interface Row {
  id: string;
  fileName: string;
  sizeBytes: number;
  expiresAt: Date | null;
  category: { name: string };
  employee: { id: string; firstName: string; lastName: string };
}

function DocumentTable({
  title,
  description,
  documents,
  emptyMessage,
}: {
  title: string;
  description: string;
  documents: Row[];
  emptyMessage: string;
}) {
  return (
    <Card>
      <CardHeader title={`${title} (${documents.length})`} description={description} />
      {documents.length === 0 ? (
        <EmptyState title={emptyMessage} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Document</Th>
              <Th>Employee</Th>
              <Th>Category</Th>
              <Th>Size</Th>
              <Th>Expiry</Th>
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => (
              <tr key={document.id} className="hover:bg-[--color-canvas]">
                <Td>
                  <a
                    href={`/api/documents/${document.id}/download`}
                    className="font-medium text-[--color-brand] hover:underline"
                  >
                    {document.fileName}
                  </a>
                </Td>
                <Td>
                  <Link href={`/people/${document.employee.id}`} className="hover:underline">
                    {document.employee.firstName} {document.employee.lastName}
                  </Link>
                </Td>
                <Td>{document.category.name}</Td>
                <Td>{formatBytes(document.sizeBytes)}</Td>
                <Td>
                  <span className="flex items-center gap-2">
                    <ExpiryBadge expiresAt={document.expiresAt} />
                    <span className="sr-only">{formatDate(document.expiresAt)}</span>
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
