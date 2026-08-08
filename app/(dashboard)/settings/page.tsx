import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { listPendingInvites } from "@/lib/modules/accounts/service";
import {
  getTenant,
  listDocumentCategoriesForSettings,
  listEmploymentTypes,
  listTenantUsers,
} from "@/lib/modules/settings/service";
import { assertCan } from "@/lib/permissions";
import { ConfigLists } from "@/app/(dashboard)/settings/config-lists";
import { PendingInvites } from "@/app/(dashboard)/settings/pending-invites";
import { TenantForm } from "@/app/(dashboard)/settings/tenant-form";
import { UserRoles } from "@/app/(dashboard)/settings/user-roles";
import { ButtonLink, PageHeader } from "@/components/ui";

export const metadata = { title: "Settings · HR Platform" };

export default async function SettingsPage() {
  const actor = await requireActor();
  assertCan(actor, "settings:manage");

  const [tenant, employmentTypes, documentCategories, users, invites] = await Promise.all([
    getTenant(actor),
    listEmploymentTypes(actor, true),
    listDocumentCategoriesForSettings(actor),
    listTenantUsers(actor),
    listPendingInvites(actor),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Organisation profile, configuration lists, and who can sign in."
        action={
          <ButtonLink variant="secondary" href="/settings/audit">
            View audit log
          </ButtonLink>
        }
      />

      <div className="space-y-4">
        <TenantForm tenant={tenant} />
        <ConfigLists employmentTypes={employmentTypes} documentCategories={documentCategories} />
        <PendingInvites invites={invites} />
        <UserRoles users={users} currentUserId={actor.userId} />

        <p className="text-sm text-[--color-muted]">
          Looking for departments? They live under{" "}
          <Link href="/org/departments" className="text-[--color-brand] hover:underline">
            Departments
          </Link>
          .
        </p>
      </div>
    </>
  );
}
