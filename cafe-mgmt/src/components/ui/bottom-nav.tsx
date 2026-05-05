"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Carrot,
  AlertTriangle,
  ClipboardList,
  Truck,
  UtensilsCrossed,
  Coffee,
  ShoppingCart,
  BarChart3,
} from "lucide-react";
import type { Role } from "@/generated/prisma/enums";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  managerOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Feed", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/ingredients", label: "Ingredients", icon: Carrot, managerOnly: true },
  { href: "/wastage", label: "Wastage", icon: AlertTriangle },
  { href: "/daily-report", label: "Sales", icon: ClipboardList },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/recipes", label: "Recipes", icon: UtensilsCrossed },
  { href: "/grab-and-go", label: "Grab&Go", icon: Coffee },
  { href: "/purchases", label: "Purchases", icon: ShoppingCart },
  { href: "/revenue", label: "Revenue", icon: BarChart3 },
];

export function BottomNav({ role }: { role: Role }) {
  const pathname = usePathname();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.managerOnly || role === "MANAGER"
  );

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden"
      style={{
        height: `calc(56px + env(safe-area-inset-bottom, 0px))`,
        paddingBottom: `env(safe-area-inset-bottom, 0px)`,
        backgroundColor: `color-mix(in srgb, var(--bg-secondary) 92%, transparent)`,
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderTop: "1px solid var(--border-default)",
      }}
    >
      <div className="mx-auto flex h-[56px] max-w-[540px] items-center justify-around px-[var(--space-2)]">
        {visibleItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 touch-target flex-col items-center justify-center gap-[3px] rounded-lg py-1 mx-1 ${
                isActive
                  ? "text-[#a78bfa]"
                  : "text-[var(--text-secondary)] active:text-[var(--text-primary)]"
              }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
              <span className={`text-[11px] leading-none ${isActive ? "font-semibold" : "font-medium"}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
