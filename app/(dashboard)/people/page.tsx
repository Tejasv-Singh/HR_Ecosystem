import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { employeeFilterSchema } from "@/lib/modules/people/schemas";
import { listDistinctLocations, listEmployeeOptions, listEmployees } from "@/lib/modules/people/service";
import { listDepartments } from "@/lib/modules/org/service";
import { can } from "@/lib/permissions";
import { DirectoryFilters } from "@/app/(dashboard)/people/directory-filters";
import {
  Avatar,
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  displayName,
  humanise,
  statusTone,
} from "@/components/ui";

export const metadata = { title: "People · HR Platform" };

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActor();
  const raw = await searchParams;

  const filter = employeeFilterSchema.parse({
    q: first(raw.q),
    departmentId: first(raw.departmentId),
    status: first(raw.status) || undefined,
    location: first(raw.location),
    managerId: first(raw.managerId),
    page: first(raw.page) ?? 1,
    pageSize: 25,
  });

  const [{ items, total, page, pageSize }, departments, locations, managers] = await Promise.all([
    listEmployees(actor, filter),
    listDepartments(actor),
    listDistinctLocations(actor),
    listEmployeeOptions(actor),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <PageHeader
        title="People"
        description={`${total} ${total === 1 ? "person" : "people"} in the directory`}
        action={
          can(actor, "employee:create") ? <ButtonLink href="/people/new">Add employee</ButtonLink> : undefined
        }
      />

      <DirectoryFilters departments={departments} locations={locations} managers={managers} />

      <Card className="mt-4">
        {items.length === 0 ? (
          <EmptyState title="No matching people" hint="Try clearing the filters or searching for something else." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Job title</Th>
                <Th>Department</Th>
                <Th>Manager</Th>
                <Th>Location</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((employee) => (
                <tr key={employee.id} className="hover:bg-[--color-canvas]">
                  <Td>
                    <Link href={`/people/${employee.id}`} className="flex items-center gap-2.5 font-medium hover:underline">
                      <Avatar person={employee} size={32} />
                      <span>
                        <span className="block">{displayName(employee)}</span>
                        <span className="block text-xs font-normal text-[--color-muted]">{employee.workEmail}</span>
                      </span>
                    </Link>
                  </Td>
                  <Td>{employee.jobTitle ?? "—"}</Td>
                  <Td>{employee.department?.name ?? "—"}</Td>
                  <Td>
                    {employee.manager ? (
                      <Link href={`/people/${employee.manager.id}`} className="hover:underline">
                        {employee.manager.firstName} {employee.manager.lastName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>{employee.location ?? "—"}</Td>
                  <Td>
                    <Badge tone={statusTone(employee.status)}>{humanise(employee.status)}</Badge>
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
              <ButtonLink variant="secondary" href={pageHref(raw, page - 1)}>
                Previous
              </ButtonLink>
            ) : null}
            {page < totalPages ? (
              <ButtonLink variant="secondary" href={pageHref(raw, page + 1)}>
                Next
              </ButtonLink>
            ) : null}
          </div>
        </nav>
      ) : null}
    </>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  const result = Array.isArray(value) ? value[0] : value;
  return result === "" ? undefined : result;
}

function pageHref(raw: Record<string, string | string[] | undefined>, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const single = first(value);
    if (single && key !== "page") params.set(key, single);
  }
  params.set("page", String(page));
  return `/people?${params.toString()}`;
}
