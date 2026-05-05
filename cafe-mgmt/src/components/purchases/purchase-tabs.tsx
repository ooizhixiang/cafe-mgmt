"use client";

import Link from "next/link";

export function PurchaseTabs({ activeTab }: { activeTab: string }) {
  return (
    <div
      role="tablist"
      className="flex rounded-lg bg-[var(--bg-secondary)] p-1 mt-[var(--space-4)]"
    >
      <Link
        href="/purchases?tab=log"
        role="tab"
        aria-selected={activeTab === "log"}
        className={`flex-1 text-center py-[var(--space-2)] text-body font-medium rounded-lg transition-all ${
          activeTab === "log"
            ? "bg-[var(--bg-primary)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)]"
        }`}
        style={activeTab === "log" ? { boxShadow: "var(--shadow-sm)" } : undefined}
      >
        Log new
      </Link>
      <Link
        href="/purchases?tab=history"
        role="tab"
        aria-selected={activeTab === "history"}
        className={`flex-1 text-center py-[var(--space-2)] text-body font-medium rounded-lg transition-all ${
          activeTab === "history"
            ? "bg-[var(--bg-primary)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)]"
        }`}
        style={activeTab === "history" ? { boxShadow: "var(--shadow-sm)" } : undefined}
      >
        History
      </Link>
    </div>
  );
}
