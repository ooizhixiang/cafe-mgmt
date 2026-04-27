import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FeedClient } from "@/components/feed/feed-client";
import { StaffOrientation } from "@/components/feed/staff-orientation";
import { DashboardStats, TopSellingRecipes, TopIngredients } from "@/components/feed/dashboard-stats";

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

      {/* Activity feed */}
      <div className="mt-[var(--space-4)]">
        <h2 className="text-body font-semibold mb-[var(--space-3)]">Activity Feed</h2>
        <FeedClient />
      </div>
    </div>
  );
}
