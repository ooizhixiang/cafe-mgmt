"use client";

import { useState } from "react";
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
  Settings,
  CupSoda,
  Coffee,
  BarChart3,
  ShoppingCart,
} from "lucide-react";
import type { Role } from "@/generated/prisma/enums";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  managerOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/ingredients", label: "Ingredients", icon: Carrot, managerOnly: true },
  { href: "/wastage", label: "Wastage", icon: AlertTriangle },
  { href: "/daily-report", label: "Sales", icon: ClipboardList },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/recipes", label: "Recipes", icon: UtensilsCrossed },
  { href: "/grab-and-go", label: "Grab & Go", icon: Coffee },
  { href: "/purchases", label: "Purchases", icon: ShoppingCart },
  { href: "/revenue", label: "Revenue", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function SideNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.managerOnly || role === "MANAGER"
  );

  return (
    <nav
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className={`fixed left-0 top-0 bottom-0 z-50 hidden lg:flex flex-col border-r border-[var(--border-default)] transition-all duration-300 ease-in-out ${
        expanded ? "w-[240px]" : "w-[68px]"
      }`}
      style={{ background: "linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-page) 100%)" }}
    >
      {/* Logo / brand */}
      <div className="flex items-center gap-2.5 px-[18px] pt-7 pb-6 overflow-hidden">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-info)] text-white">
          <CupSoda size={20} strokeWidth={2.2} />
        </div>
        <span
          className={`text-body font-bold text-[var(--text-primary)] whitespace-nowrap transition-opacity duration-300 ${
            expanded ? "opacity-100" : "opacity-0"
          }`}
        >
          Cafe Management
        </span>
      </div>

      {/* Nav items */}
      <div className="flex-1 px-2 space-y-1">
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
              title={expanded ? undefined : item.label}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-body transition-all overflow-hidden ${
                isActive
                  ? "text-white font-semibold"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
              }`}
              style={isActive ? { background: "linear-gradient(135deg, #6366f1, #8b5cf6)" } : undefined}
            >
              <span className="shrink-0"><Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} /></span>
              <span
                className={`whitespace-nowrap transition-opacity duration-300 ${
                  expanded ? "opacity-100" : "opacity-0"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Bottom section */}
      <div className="px-2 pb-6">
        <div className="border-t border-[var(--border-default)] pt-4 px-3 overflow-hidden">
          <p
            className={`text-meta text-[var(--text-disabled)] whitespace-nowrap transition-opacity duration-300 ${
              expanded ? "opacity-100" : "opacity-0"
            }`}
          >
            Cafe Management
          </p>
        </div>
      </div>
    </nav>
  );
}
