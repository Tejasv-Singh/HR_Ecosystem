import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { getOrgChart, type OrgChartNode } from "@/lib/modules/org/service";
import { Avatar, Badge, Card, EmptyState, PageHeader, humanise, statusTone } from "@/components/ui";

export const metadata = { title: "Org chart · HR Platform" };

export default async function OrgChartPage() {
  const actor = await requireActor();
  const roots = await getOrgChart(actor);
  const total = countNodes(roots);

  return (
    <>
      <PageHeader
        title="Org chart"
        description="Derived from reporting lines. People without a manager appear at the top level."
      />

      <Card className="p-5">
        {roots.length === 0 ? (
          <EmptyState title="Nobody to show yet" hint="Add employees and set their managers to build the chart." />
        ) : (
          <>
            <p className="mb-4 text-sm text-[--color-muted]">{total} people</p>
            <ul className="space-y-3">
              {roots.map((node) => (
                <OrgBranch key={node.id} node={node} depth={0} />
              ))}
            </ul>
          </>
        )}
      </Card>
    </>
  );
}

function OrgBranch({ node, depth }: { node: OrgChartNode; depth: number }) {
  const hasReports = node.reports.length > 0;

  return (
    <li>
      {/* `open` by default for the top two levels keeps large charts readable. */}
      <details open={depth < 2} className={hasReports ? "" : "[&>summary]:list-none"}>
        <summary className={`cursor-pointer rounded-lg py-1 ${hasReports ? "" : "pointer-events-none"}`}>
          <span className="inline-flex items-center gap-2.5 align-middle">
            <Avatar person={node} size={32} />
            <span>
              <Link href={`/people/${node.id}`} className="text-sm font-medium hover:underline">
                {node.preferredName || node.firstName} {node.lastName}
              </Link>
              <span className="block text-xs text-[--color-muted]">
                {[node.jobTitle, node.departmentName].filter(Boolean).join(" · ") || "—"}
                {hasReports ? ` · ${node.reports.length} report${node.reports.length === 1 ? "" : "s"}` : ""}
              </span>
            </span>
            {node.status !== "ACTIVE" ? <Badge tone={statusTone(node.status)}>{humanise(node.status)}</Badge> : null}
          </span>
        </summary>

        {hasReports ? (
          <ul className="mt-2 space-y-2 border-l border-[--color-line] pl-5">
            {node.reports.map((report) => (
              <OrgBranch key={report.id} node={report} depth={depth + 1} />
            ))}
          </ul>
        ) : null}
      </details>
    </li>
  );
}

function countNodes(nodes: OrgChartNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.reports), 0);
}
