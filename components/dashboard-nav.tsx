"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Briefcase, Building2, CalendarDays, Clock, FileText, ListChecks, LogOut, Network, Settings, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  adminOnly?: boolean;
  /** Visible to admins and to managers, who may be hiring managers. */
  recruiterOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/people", label: "People", icon: Users },
  { href: "/org", label: "Org chart", icon: Network },
  { href: "/org/departments", label: "Departments", icon: Building2 },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/leave", label: "Leave", icon: CalendarDays },
  { href: "/time", label: "Timesheet", icon: Clock },
  { href: "/tasks", label: "My tasks", icon: ListChecks },
  { href: "/recruiting", label: "Recruitment", icon: Briefcase, recruiterOnly: true },
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

export function DashboardNav({
  role,
  tenantName,
  employeeId,
  person,
  email,
}: {
  role: string;
  tenantName: string;
  employeeId: string | null;
  person: { firstName: string; lastName: string; preferredName?: string | null; jobTitle?: string | null };
  email: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const isAdmin = role === "HR_ADMIN" || role === "SUPER_ADMIN";

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/session", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-[--color-line] bg-[--color-surface]">
      <div className="border-b border-[--color-line] px-5 py-4">
        <p className="truncate text-sm font-semibold tracking-tight" title={tenantName}>
          {tenantName}
        </p>
        <p className="text-xs text-[--color-muted]">HR Platform</p>
      </div>

      <nav className="flex-1 space-y-0.5 p-3">
        {NAV.filter((item) => (!item.adminOnly || isAdmin) && (!item.recruiterOnly || isAdmin || role === "MANAGER")).map((item) => {
          // `/org` must not light up while on `/org/departments`.
          const active = pathname === item.href || (item.href !== "/org" && pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-[--color-brand-wash] text-[--color-brand-ink]" : "text-[--color-muted] hover:bg-[--color-canvas] hover:text-[--color-ink]",
              )}
            >
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[--color-line] p-3">
        {employeeId ? (
          <Link href={`/people/${employeeId}`} className="mb-1 flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-[--color-canvas]">
            <Avatar person={person} size={32} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {person.preferredName || person.firstName} {person.lastName}
              </span>
              <span className="block truncate text-xs text-[--color-muted]">{roleLabel(role)}</span>
            </span>
          </Link>
        ) : (
          <div className="mb-1 px-2 py-2">
            <p className="truncate text-sm font-medium">{email}</p>
            <p className="text-xs text-[--color-muted]">{roleLabel(role)}</p>
          </div>
        )}

        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[--color-muted] transition-colors hover:bg-[--color-canvas] hover:text-[--color-ink] disabled:opacity-60"
        >
          <LogOut size={16} />
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </aside>
  );
}

function roleLabel(role: string): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super administrator";
    case "HR_ADMIN":
      return "HR administrator";
    case "MANAGER":
      return "Manager";
    default:
      return "Employee";
  }
}
