"use client";

import Link from "next/link";

export function WastageCompTabs({ activeTab }: { activeTab: string }) {
  return (
    <div className="flex rounded-lg bg-[var(--bg-secondary)] p-1 mt-[var(--space-4)]">
      <Link
        href="/wastage?tab=wastage"
        className={`flex-1 text-center py-[var(--space-2)] text-body font-medium rounded-lg transition-all ${
          activeTab === "wastage"
            ? "bg-[var(--bg-primary)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)]"
        }`}
        style={activeTab === "wastage" ? { boxShadow: "var(--shadow-sm)" } : undefined}
      >
        Wastage
      </Link>
      <Link
        href="/wastage?tab=comp"
        className={`flex-1 text-center py-[var(--space-2)] text-body font-medium rounded-lg transition-all ${
          activeTab === "comp"
            ? "bg-[var(--bg-primary)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)]"
        }`}
        style={activeTab === "comp" ? { boxShadow: "var(--shadow-sm)" } : undefined}
      >
        Complimentary
      </Link>
    </div>
  );
}
