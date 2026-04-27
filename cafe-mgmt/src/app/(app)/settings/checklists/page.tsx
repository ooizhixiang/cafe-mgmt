import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ChecklistEditor } from "@/components/settings/checklist-editor";
import Link from "next/link";

export default async function ChecklistManagementPage() {
  const session = await requireRole("MANAGER");
  const cafeId = session.user.cafeId;

  const templates = await prisma.checklistTemplate.findMany({
    where: { cafeId },
    include: {
      items: { orderBy: { displayOrder: "asc" } },
    },
    orderBy: { period: "asc" },
  });

  return (
    <div className="p-[var(--space-4)] lg:p-8 lg:pt-10 lg:max-w-[960px] lg:mx-auto">
      <div className="flex items-center justify-between mb-[var(--space-6)]">
        <h1 className="text-headline">Checklists</h1>
        <Link
          href="/settings/checklists/history"
          className="text-meta text-[var(--color-info)]"
        >
          View history
        </Link>
      </div>

      {templates.length === 0 ? (
        <p className="text-body text-[var(--text-secondary)]">
          No checklist templates yet. Select a cafe template to get started.
        </p>
      ) : (
        templates.map((template) => (
          <ChecklistEditor
            key={template.id}
            templateId={template.id}
            templateName={template.name}
            period={template.period}
            initialItems={template.items}
          />
        ))
      )}

      <Link
        href="/settings"
        className="text-body text-[var(--color-info)] mt-[var(--space-4)] inline-block"
      >
        ← Back to Settings
      </Link>
    </div>
  );
}
