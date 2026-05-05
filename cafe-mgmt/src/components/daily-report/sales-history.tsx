"use client";

import { useState, useEffect, useTransition } from "react";
import {
  getSalesHistory,
  voidSalesSubmission,
  type SalesHistoryDay,
} from "@/actions/daily-report.actions";
import { formatCents, formatTime } from "@/lib/format";
import { useToast } from "@/components/ui/toast";

export function SalesHistoryPanel({ isManager }: { isManager: boolean }) {
  const [days, setDays] = useState<SalesHistoryDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [voidDialog, setVoidDialog] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const result = await getSalesHistory();
    if (result.success) {
      setDays(result.data);
    } else {
      toast(result.error);
    }
    setLoading(false);
  }

  function handleVoid(submissionId: string) {
    startTransition(async () => {
      const result = await voidSalesSubmission({
        submissionId,
        reason: voidReason.trim() || undefined,
      });
      if (!result.success) {
        toast(result.error);
        return;
      }
      toast("Submission voided");
      setVoidDialog(null);
      setVoidReason("");
      await loadData();
    });
  }

  if (loading) {
    return (
      <div className="text-meta text-[var(--text-secondary)] text-center py-[var(--space-4)]">
        Loading...
      </div>
    );
  }

  if (days.length === 0) {
    return (
      <div className="text-body text-[var(--text-secondary)] text-center py-[var(--space-6)]">
        No sales reports yet.
      </div>
    );
  }

  return (
    <div className="space-y-[var(--space-4)]">
      {days.map((day) => {
        const dateLabel = formatDateLabel(day.saleDate);
        const totalQty = day.mergedByRecipe.reduce((s, r) => s + r.qtySold, 0);
        const totalRevenue = day.mergedByRecipe.reduce(
          (s, r) => s + r.revenueInCents,
          0
        );
        const totalCost = day.mergedByRecipe.reduce(
          (s, r) => s + r.costInCents,
          0
        );

        return (
          <div
            key={day.saleDate}
            className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-4)]"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-baseline justify-between mb-[var(--space-3)]">
              <h3 className="text-body font-semibold">{dateLabel}</h3>
              <span className="text-meta text-[var(--text-secondary)]">
                {day.submissions.length} submission
                {day.submissions.length !== 1 ? "s" : ""}
              </span>
            </div>

            {day.mergedByRecipe.length === 0 ? (
              <p className="text-meta text-[var(--text-secondary)] py-[var(--space-3)]">
                All submissions for this day are voided.
              </p>
            ) : (
              <table className="w-full mb-[var(--space-3)]">
                <thead>
                  <tr className="border-b border-[var(--border-default)]">
                    <th className="text-left text-meta font-medium text-[var(--text-secondary)] pb-2">
                      Recipe
                    </th>
                    <th className="text-right text-meta font-medium text-[var(--text-secondary)] pb-2">
                      Qty
                    </th>
                    <th className="text-right text-meta font-medium text-[var(--text-secondary)] pb-2">
                      Revenue
                    </th>
                    <th className="text-right text-meta font-medium text-[var(--text-secondary)] pb-2">
                      Cost
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {day.mergedByRecipe.map((row) => (
                    <tr
                      key={row.recipeName}
                      className="border-b border-[var(--border-default)] last:border-b-0"
                    >
                      <td className="text-body py-2">{row.recipeName}</td>
                      <td className="text-body font-medium text-right py-2">
                        {row.qtySold}
                      </td>
                      <td className="text-body text-right py-2">
                        {formatCents(row.revenueInCents)}
                      </td>
                      <td className="text-meta text-[var(--text-secondary)] text-right py-2">
                        {formatCents(row.costInCents)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[var(--text-primary)]">
                    <td className="text-body font-semibold py-2">Total</td>
                    <td className="text-body font-bold text-right py-2">
                      {totalQty}
                    </td>
                    <td className="text-body font-bold text-right py-2">
                      {formatCents(totalRevenue)}
                    </td>
                    <td className="text-meta text-[var(--text-secondary)] text-right py-2">
                      {formatCents(totalCost)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}

            {/* Submissions footer */}
            <div className="border-t border-[var(--border-default)] pt-[var(--space-3)] space-y-[var(--space-1)]">
              {day.submissions.map((sub, idx) => {
                const isVoided = sub.voidedAt !== null;
                const isLegacy = sub.id === null;
                const submittedTime = formatTime(new Date(sub.createdAt));
                const rowCount = sub.rows.length;

                return (
                  <div
                    key={sub.id ?? `legacy-${idx}`}
                    className={`flex items-center justify-between text-meta ${
                      isVoided ? "opacity-60" : ""
                    }`}
                  >
                    <span className="text-[var(--text-secondary)]">
                      <span className={isVoided ? "line-through" : ""}>
                        Submission at {submittedTime} by {sub.createdByName}
                      </span>
                      {" — "}
                      {rowCount} row{rowCount !== 1 ? "s" : ""}
                      {isVoided && " (voided)"}
                    </span>
                    {isManager && !isVoided && !isLegacy && sub.id && (
                      <button
                        onClick={() => {
                          setVoidDialog(sub.id);
                          setVoidReason("");
                        }}
                        className="text-meta text-[var(--color-urgent,#dc2626)] font-medium ml-[var(--space-2)]"
                      >
                        Void
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Void confirmation dialog */}
      {voidDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-[var(--space-4)] animate-[fadeIn_0.15s_ease-out]">
          <div
            className="w-full max-w-[320px] rounded-lg bg-[var(--bg-primary)] p-[var(--space-5)] animate-slide-up"
            style={{ boxShadow: "var(--shadow-lg)" }}
          >
            <h3 className="text-body font-semibold mb-[var(--space-3)]">
              Void Submission
            </h3>
            <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-3)]">
              This will mark all rows in this submission as voided and restore
              the affected ingredients to today&apos;s stock.
            </p>
            <input
              type="text"
              placeholder="Reason (optional)"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-body mb-[var(--space-3)]"
              autoFocus
            />
            <div className="flex gap-[var(--space-2)]">
              <button
                onClick={() => {
                  setVoidDialog(null);
                  setVoidReason("");
                }}
                className="flex-1 rounded-lg border border-[var(--border-default)] px-3 py-2.5 text-body active:scale-[0.97]"
              >
                Cancel
              </button>
              <button
                onClick={() => handleVoid(voidDialog)}
                disabled={isPending}
                className="flex-1 rounded-lg bg-[var(--color-urgent)] px-3 py-2.5 text-body font-medium text-white disabled:opacity-50 active:scale-[0.97]"
              >
                Void
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDateLabel(isoDate: string): string {
  // isoDate is YYYY-MM-DD; render as "Mon, May 5, 2026" using UTC noon to
  // dodge timezone DST surprises on the boundary.
  const d = new Date(`${isoDate}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
