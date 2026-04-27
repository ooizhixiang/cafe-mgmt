import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { BottomNav } from "@/components/ui/bottom-nav";
import { ToastProvider } from "@/components/ui/toast";
import { UndoToastProvider } from "@/components/providers/undo-toast-provider";
import { SetupNavHider } from "@/components/setup/setup-nav-hider";
import { DarkModeSync } from "@/components/settings/dark-mode-sync";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.isActive) {
    redirect("/login");
  }

  return (
    <ToastProvider>
      <UndoToastProvider>
        <DarkModeSync />
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <SetupNavHider role={session.user.role}>
          {children}
        </SetupNavHider>
      </UndoToastProvider>
    </ToastProvider>
  );
}
