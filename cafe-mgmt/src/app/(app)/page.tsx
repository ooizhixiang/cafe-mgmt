import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FeedClient } from "@/components/feed/feed-client";
import { InventoryLog } from "@/components/feed/inventory-log";
import { StaffOrientation } from "@/components/feed/staff-orientation";
import { DashboardStats, TopSellingRecipes, TopIngredients } from "@/components/feed/dashboard-stats";
import { getInventoryLog } from "@/actions/inventory.actions";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) return null;

  // Check if staff needs orientation (Story 1.6)
  let showOrientation = false;
  let cafeName = "";
  let userName = "";

  if (session.user.role === "STAFF") {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        orientationDismissedAt: true,
        name: true,
        cafe: { select: { name: true } },
      },
    });
    if (user && !user.orientationDismissedAt) {
      showOrientation = true;
      cafeName = user.cafe.name;
    }
    userName = user?.name ?? "";
  } else {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true },
    });
    userName = user?.name ?? "";
  }

  const firstName = userName.split(" ")[0] || "there";

  // Server-fetch the initial page of the inventory log. If the action fails
  // OR throws (e.g. Prisma connection error before the action's catch returns),
  // the dashboard still renders — the log shows the empty state.
  let initialLogEntries: Awaited<ReturnType<typeof getInventoryLog>> extends { success: true; data: { entries: infer T } } ? T : never = [] as never;
  let initialLogNextCursor: number | null = null;
  try {
    const logResult = await getInventoryLog({ cursor: 0, limit: 30 });
    if (logResult.success) {
      initialLogEntries = logResult.data.entries as never;
      initialLogNextCursor = logResult.data.nextCursor;
    }
  } catch {
    // Swallow — empty state already set above.
  }

  return (
    <div className="p-[var(--space-4)] pt-[var(--space-6)] lg:p-8 lg:pt-10 lg:max-w-[1200px] lg:mx-auto">
      <div className="mb-[var(--space-6)]">
        <h1 className="text-headline">Dashboard</h1>
        <p className="text-meta text-[var(--text-secondary)]">
          Welcome back, {firstName}! Here is your overview.
        </p>
      </div>

      {showOrientation && <StaffOrientation cafeName={cafeName} />}

      {/* Summary cards */}
      <DashboardStats />

      {/* Charts row */}
      <div className="grid lg:grid-cols-2 gap-[var(--space-4)] mt-[var(--space-4)]">
        <TopSellingRecipes />
        <TopIngredients />
      </div>

      {/* Activity feed (left) + Inventory log (right) */}
      <div className="grid lg:grid-cols-2 gap-[var(--space-4)] mt-[var(--space-4)]">
        <div>
          <h2 className="text-body font-semibold mb-[var(--space-3)]">Activity Feed</h2>
          <FeedClient />
        </div>
        <InventoryLog
          initialEntries={initialLogEntries}
          initialNextCursor={initialLogNextCursor}
        />
      </div>
    </div>
  );
}
