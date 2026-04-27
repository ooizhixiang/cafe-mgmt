import { requireAuth } from "@/lib/auth";
import { GrabAndGoList } from "@/components/grab-and-go/grab-and-go-list";

export default async function GrabAndGoPage() {
  const session = await requireAuth();
  const isManager = session.user.role === "MANAGER";

  return (
    <div className="p-[var(--space-4)] pt-[var(--space-6)] lg:p-8 lg:pt-10 lg:max-w-[960px] lg:mx-auto">
      <h1 className="text-headline mb-[var(--space-1)]">Grab & Go</h1>
      <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-4)]">
        Ready-made drinks and items for quick sale
      </p>
      <GrabAndGoList isManager={isManager} />
    </div>
  );
}
