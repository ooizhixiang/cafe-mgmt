"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/ui/bottom-nav";
import { SideNav } from "@/components/ui/side-nav";
import type { Role } from "@/generated/prisma/enums";

export function SetupNavHider({
  role,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isSetup = pathname.startsWith("/setup");

  return (
    <>
      {/* Desktop sidebar — hidden on mobile, visible lg+ */}
      {!isSetup && <SideNav role={role} />}

      <main
        id="main-content"
        className={`min-h-dvh bg-[var(--bg-primary)] ${
          isSetup
            ? "mx-auto max-w-[480px]"
            : "mx-auto max-w-[480px] pb-[calc(56px+env(safe-area-inset-bottom,0px))] lg:ml-[68px] lg:max-w-none lg:pb-0"
        }`}
        style={{ boxShadow: "4px 0 24px rgba(0,0,0,0.03), -4px 0 24px rgba(0,0,0,0.03)" }}
      >
        {children}
      </main>

      {/* Mobile bottom nav — visible on mobile, hidden lg+ */}
      {!isSetup && <BottomNav role={role} />}
    </>
  );
}
