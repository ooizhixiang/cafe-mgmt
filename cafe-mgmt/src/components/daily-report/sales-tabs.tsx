"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function SalesTabs({ activeTab }: { activeTab: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setTab(tab: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "report") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const qs = params.toString();
    router.push(`/daily-report${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="flex rounded-lg bg-[var(--bg-secondary,#f3f4f6)] p-1 mb-[var(--space-4)]">
      <button
        onClick={() => setTab("report")}
        className={`flex-1 rounded-lg py-2 text-body font-medium transition-all ${
          activeTab === "report"
            ? "bg-[var(--bg-primary)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)]"
        }`}
        style={activeTab === "report" ? { boxShadow: "var(--shadow-card)" } : undefined}
      >
        Report
      </button>
      <button
        onClick={() => setTab("history")}
        className={`flex-1 rounded-lg py-2 text-body font-medium transition-all ${
          activeTab === "history"
            ? "bg-[var(--bg-primary)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)]"
        }`}
        style={activeTab === "history" ? { boxShadow: "var(--shadow-card)" } : undefined}
      >
        History
      </button>
      <button
        onClick={() => setTab("analysis")}
        className={`flex-1 rounded-lg py-2 text-body font-medium transition-all ${
          activeTab === "analysis"
            ? "bg-[var(--bg-primary)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)]"
        }`}
        style={activeTab === "analysis" ? { boxShadow: "var(--shadow-card)" } : undefined}
      >
        Analysis
      </button>
    </div>
  );
}
