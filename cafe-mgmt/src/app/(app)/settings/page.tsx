import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { LogoutButton } from "./logout-button";
import { StaffList } from "@/components/staff/staff-list";
import { InviteSection } from "@/components/staff/invite-section";
import { TimeBoundaries } from "@/components/settings/time-boundaries";
import { CompBudgetSettings } from "@/components/settings/comp-budget";
import { DarkModeToggle } from "@/components/settings/dark-mode-toggle";
import { PushToggle } from "@/components/settings/push-toggle";
import { EnabledUnitsEditor } from "@/components/settings/enabled-units";
import { MinMarginSettings } from "@/components/settings/min-margin";

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const cafeId = session.user.cafeId;
  const isManager = session.user.role === "MANAGER";

  // Load staff list, pending invites, cafe settings, and comp budget server-side
  const [staff, pendingInvites, cafe, compBudget, userPrefs] = await Promise.all([
    prisma.user.findMany({
      where: { cafeId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invite.findMany({
      where: {
        cafeId,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, code: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    }),
    isManager
      ? prisma.cafe.findUnique({
          where: { id: cafeId },
          select: {
            openingStart: true,
            openingEnd: true,
            midDayStart: true,
            midDayEnd: true,
            closingStart: true,
            closingEnd: true,
            enabledUnits: true,
            minMarginPercent: true,
          },
        })
      : null,
    isManager
      ? prisma.compBudget.findUnique({
          where: { cafeId },
          select: { amountInCents: true, resetDay: true },
        })
      : null,
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { darkMode: true },
    }),
  ]);

  return (
    <div className="p-[var(--space-4)] pt-[var(--space-6)] lg:p-8 lg:pt-10 lg:max-w-[960px] lg:mx-auto">
      <h1 className="text-headline mb-[var(--space-1)]">Settings</h1>
      <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-6)]">Manage your cafe</p>

      <div className="space-y-[var(--space-6)] lg:max-w-[640px]">
        {/* Section 1: Checklist Time Boundaries (Manager only) */}
        {isManager && cafe && (
          <section>
            <h2 className="text-value mb-[var(--space-3)]">Checklist Time Boundaries</h2>
            <div className="rounded-lg p-[var(--space-4)]" style={{ boxShadow: "var(--shadow-card)" }}>
              <TimeBoundaries
                initialValues={{
                  openingStart: cafe.openingStart,
                  openingEnd: cafe.openingEnd,
                  midDayStart: cafe.midDayStart,
                  midDayEnd: cafe.midDayEnd,
                  closingStart: cafe.closingStart,
                  closingEnd: cafe.closingEnd,
                }}
              />
            </div>
          </section>
        )}

        {/* Section 2: Checklist Configuration (Story 2.2) */}
        {isManager && (
          <section>
            <h2 className="text-value mb-[var(--space-3)]">Checklist Configuration</h2>
            <div className="rounded-lg p-[var(--space-4)]" style={{ boxShadow: "var(--shadow-card)" }}>
              <p className="text-body text-[var(--text-secondary)] mb-[var(--space-3)]">
                Manage your Opening, Mid-Day, and Closing checklists.
              </p>
              <Link
                href="/settings/checklists"
                className="text-body text-[var(--color-info)] font-medium"
              >
                Edit checklists →
              </Link>
            </div>
          </section>
        )}

        {/* Comp Budget (Story 3.8) */}
        {isManager && (
          <section>
            <h2 className="text-value mb-[var(--space-3)]">Complimentary Budget</h2>
            <div className="rounded-lg p-[var(--space-4)]" style={{ boxShadow: "var(--shadow-card)" }}>
              <CompBudgetSettings initialBudget={compBudget} />
            </div>
          </section>
        )}

        {/* Units (cafe-enabled-units feature) */}
        {isManager && cafe && (
          <section>
            <div className="rounded-lg p-[var(--space-4)]" style={{ boxShadow: "var(--shadow-card)" }}>
              <EnabledUnitsEditor
                initialEnabledUnits={cafe.enabledUnits}
                isManager={isManager}
              />
            </div>
          </section>
        )}

        {/* Minimum Margin (recipe-margin-alert-cards feature) */}
        {isManager && cafe && (
          <section>
            <div className="rounded-lg p-[var(--space-4)]" style={{ boxShadow: "var(--shadow-card)" }}>
              <MinMarginSettings
                initialValue={cafe.minMarginPercent}
                isManager={isManager}
              />
            </div>
          </section>
        )}

        {/* Staff Management (Story 1.2) */}
        <StaffList
          initialStaff={staff}
          currentUserId={session.user.id}
        />

        <InviteSection initialInvites={pendingInvites} />

        {/* Notifications */}
        <section>
          <h2 className="text-value mb-[var(--space-3)]">Notifications</h2>
          <PushToggle />
        </section>

        {/* Appearance */}
        <section>
          <h2 className="text-value mb-[var(--space-3)]">Appearance</h2>
          <DarkModeToggle initialDarkMode={userPrefs?.darkMode ?? false} />
        </section>

        {/* Account */}
        <section>
          <h2 className="text-value mb-[var(--space-3)]">Account</h2>
          <div className="rounded-lg p-[var(--space-4)]" style={{ boxShadow: "var(--shadow-card)" }}>
            <p className="text-body">{session.user.name}</p>
            <p className="text-meta text-[var(--text-secondary)]">
              {session.user.email}
            </p>
            <p className="text-meta text-[var(--text-secondary)] mt-[var(--space-1)]">
              Role: {session.user.role}
            </p>
          </div>
        </section>

        {/* Logout */}
        <section>
          <LogoutButton />
        </section>
      </div>
    </div>
  );
}
