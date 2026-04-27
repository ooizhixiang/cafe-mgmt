"use client";

import { useRouter } from "next/navigation";
import { logout } from "@/actions/auth.actions";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button
      onClick={handleLogout}
      variant="outline"
      className="w-full touch-target text-body"
    >
      Log out
    </Button>
  );
}
