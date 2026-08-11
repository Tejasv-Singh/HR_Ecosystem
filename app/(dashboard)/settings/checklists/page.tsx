import { requireActor } from "@/lib/auth/session";
import { listTemplates } from "@/lib/modules/checklists/service";
import { assertCan } from "@/lib/permissions";
import { TemplateManager } from "@/app/(dashboard)/settings/checklists/template-manager";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ChecklistSettingsPage() {
  const actor = await requireActor();
  assertCan(actor, "checklist:manage");

  const templates = await listTemplates(actor);

  return (
    <>
      <PageHeader
        title="Checklist templates"
        description="Reusable onboarding and offboarding lists. Assigning one copies its steps onto the employee."
      />
      <TemplateManager
        templates={templates.map((template) => ({
          id: template.id,
          name: template.name,
          kind: template.kind,
          isActive: template.isActive,
          usageCount: template._count.checklists,
          items: template.items.map((item) => ({
            id: item.id,
            title: item.title,
            assignee: item.assignee,
            dueOffset: item.dueOffset,
          })),
        }))}
      />
    </>
  );
}
