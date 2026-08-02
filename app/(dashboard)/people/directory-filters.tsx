"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, Card, Input, Select } from "@/components/ui";
import { employeeStatusValues } from "@/lib/modules/people/schemas";
import { humanise } from "@/components/ui";

export function DirectoryFilters({
  departments,
  locations,
  managers,
}: {
  departments: { id: string; name: string }[];
  locations: string[];
  managers: { id: string; firstName: string; lastName: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");

  /** Filters live in the URL so a filtered view can be linked and bookmarked. */
  function apply(next: Record<string, string>) {
    const merged = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value);
      else merged.delete(key);
    }
    merged.delete("page");
    router.push(`/people?${merged.toString()}`);
  }

  const hasFilters = ["q", "departmentId", "status", "location", "managerId"].some((key) => params.get(key));

  return (
    <Card className="p-4">
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
        onSubmit={(event) => {
          event.preventDefault();
          apply({ q: query });
        }}
      >
        <div className="lg:col-span-2">
          <Input
            type="search"
            placeholder="Search name, email or title"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search people"
          />
        </div>

        <Select
          aria-label="Department"
          value={params.get("departmentId") ?? ""}
          onChange={(event) => apply({ departmentId: event.target.value })}
        >
          <option value="">All departments</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </Select>

        <Select aria-label="Status" value={params.get("status") ?? ""} onChange={(event) => apply({ status: event.target.value })}>
          <option value="">Any status</option>
          {employeeStatusValues.map((status) => (
            <option key={status} value={status}>
              {humanise(status)}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Location"
          value={params.get("location") ?? ""}
          onChange={(event) => apply({ location: event.target.value })}
        >
          <option value="">All locations</option>
          {locations.map((location) => (
            <option key={location} value={location}>
              {location}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Manager"
          value={params.get("managerId") ?? ""}
          onChange={(event) => apply({ managerId: event.target.value })}
        >
          <option value="">Any manager</option>
          {managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.firstName} {manager.lastName}
            </option>
          ))}
        </Select>

        <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
          <Button type="submit" variant="secondary">
            Search
          </Button>
          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQuery("");
                router.push("/people");
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
