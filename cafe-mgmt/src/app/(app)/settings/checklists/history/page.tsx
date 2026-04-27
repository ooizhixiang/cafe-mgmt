import { requireRole } from "@/lib/auth";
import { getChecklistHistory } from "@/actions/checklist.actions";
import { ChecklistHistory } from "@/components/settings/checklist-history";
import Link from "next/link";

export default async function ChecklistHistoryPage() {
  await requireRole("MANAGER");

  const result = await getChecklistHistory();

  return (
    <div className="p-[var(--space-4)] lg:p-8 lg:pt-10 lg:max-w-[960px] lg:mx-auto">
      <h1 className="text-headline mb-[var(--space-6)]">
        Checklist History
      </h1>

      {result.success ? (
        <ChecklistHistory history={result.data} />
      ) : (
        <p className="text-body text-[var(--text-secondary)]">
          {result.error}
        </p>
      )}

      <Link
        href="/settings/checklists"
        className="text-body text-[var(--color-info)] mt-[var(--space-6)] inline-block"
      >
        ← Back to Checklists
      </Link>
    </div>
  );
}
