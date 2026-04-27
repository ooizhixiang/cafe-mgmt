"use client";

import { useState, useEffect, useTransition } from "react";
import { getWastageLog, voidWastage, correctWastage } from "@/actions/wastage.actions";
import { formatCents, formatDateTime } from "@/lib/format";
import { useToast } from "@/components/ui/toast";

interface WastageEntry {
  id: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  reason: string;
  dollarValueInCents: number;
  createdByName: string;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  originalQuantity: number | null;
  correctedQuantity: number | null;
}

export function WastageLog({ isManager }: { isManager: boolean }) {
  const [entries, setEntries] = useState<WastageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [voidDialog, setVoidDialog] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [correctDialog, setCorrectDialog] = useState<{ id: string; currentQty: number } | null>(null);
  const [newQty, setNewQty] = useState(1);
  const { toast } = useToast();

  useEffect(() => {
    loadEntries();

    function handleUpdate() { loadEntries(); }
    window.addEventListener("wastage-updated", handleUpdate);
    return () => window.removeEventListener("wastage-updated", handleUpdate);
  }, []);

  async function loadEntries() {
    setLoading(true);
    const result = await getWastageLog();
    if (result.success && result.data) {
      setEntries(result.data);
    }
    setLoading(false);
  }

  function handleVoid(id: string) {
    if (!voidReason.trim()) return;
    startTransition(async () => {
      const result = await voidWastage({ id, voidReason: voidReason.trim() });
      if (!result.success) {
        toast(result.error);
        return;
      }
      toast("Wastage voided");
      setVoidDialog(null);
      setVoidReason("");
      loadEntries();
    });
  }

  function handleCorrect() {
    if (!correctDialog) return;
    startTransition(async () => {
      const result = await correctWastage({
        id: correctDialog.id,
        newQuantity: newQty,
      });
      if (!result.success) {
        toast(result.error);
        return;
      }
      toast("Wastage corrected");
      setCorrectDialog(null);
      loadEntries();
    });
  }

  if (loading) {
    return <div className="p-[var(--space-4)] text-meta text-[var(--text-secondary)]">Loading...</div>;
  }

  if (entries.length === 0) {
    return (
      <p className="text-body text-[var(--text-secondary)] text-center py-[var(--space-4)]">
        No wastage entries yet
      </p>
    );
  }

  return (
    <div className="space-y-[var(--space-1)]">
      {entries.map((entry) => {
        const isVoided = entry.voidedAt !== null;
        const isCorrected = entry.correctedQuantity !== null;

        return (
          <div
            key={entry.id}
            className={`flex items-center justify-between rounded-lg px-[var(--space-4)] py-[var(--space-3)] ${
              isVoided ? "opacity-50" : ""
            }`}
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-[var(--space-2)]">
                <span className={`text-body ${isVoided ? "line-through" : ""}`}>
                  {entry.ingredientName}
                </span>
                <span className="text-meta text-[var(--text-secondary)]">
                  {entry.reason.toLowerCase()}
                </span>
              </div>
              <p className="text-meta text-[var(--text-secondary)]">
                {entry.createdByName} · {formatDateTime(new Date(entry.createdAt))}
              </p>
              {isVoided && entry.voidReason && (
                <p className="text-meta text-[var(--color-warning)]">
                  Voided: {entry.voidReason}
                </p>
              )}
              {isCorrected && (
                <p className="text-meta text-[var(--color-info)]">
                  Corrected: {entry.originalQuantity} → {entry.correctedQuantity}
                </p>
              )}
            </div>

            <div className="text-right shrink-0 ml-[var(--space-2)]">
              <p className={`text-body font-semibold ${isVoided ? "line-through" : "text-[var(--color-urgent,#dc2626)]"}`}>
                -{formatCents(entry.dollarValueInCents)}
              </p>
              <p className="text-meta text-[var(--text-secondary)]">
                {entry.quantity} {entry.unit}
              </p>
            </div>

            {/* Manager actions */}
            {isManager && !isVoided && (
              <div className="flex flex-col gap-1 ml-[var(--space-2)]">
                <button
                  onClick={() => setVoidDialog(entry.id)}
                  className="text-meta text-[var(--color-urgent,#dc2626)] font-medium"
                >
                  Void
                </button>
                <button
                  onClick={() => {
                    setCorrectDialog({ id: entry.id, currentQty: entry.quantity });
                    setNewQty(entry.quantity);
                  }}
                  className="text-meta text-[var(--color-info)] font-medium"
                >
                  Correct
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Void dialog */}
      {voidDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-[var(--space-4)] animate-[fadeIn_0.15s_ease-out]">
          <div className="w-full max-w-[320px] rounded-lg bg-[var(--bg-primary)] p-[var(--space-5)] animate-slide-up" style={{ boxShadow: "var(--shadow-lg)" }}>
            <h3 className="text-body font-semibold mb-[var(--space-3)]">Void Wastage</h3>
            <input
              type="text"
              placeholder="Reason for voiding..."
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-body mb-[var(--space-3)]"
              autoFocus
            />
            <div className="flex gap-[var(--space-2)]">
              <button
                onClick={() => { setVoidDialog(null); setVoidReason(""); }}
                className="flex-1 rounded-lg border border-[var(--border-default)] px-3 py-2.5 text-body active:scale-[0.97]"
              >
                Cancel
              </button>
              <button
                onClick={() => handleVoid(voidDialog)}
                disabled={isPending || !voidReason.trim()}
                className="flex-1 rounded-lg bg-[var(--color-urgent)] px-3 py-2.5 text-body font-medium text-white disabled:opacity-50 active:scale-[0.97]"
              >
                Void
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Correct dialog */}
      {correctDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-[var(--space-4)] animate-[fadeIn_0.15s_ease-out]">
          <div className="w-full max-w-[320px] rounded-lg bg-[var(--bg-primary)] p-[var(--space-5)] animate-slide-up" style={{ boxShadow: "var(--shadow-lg)" }}>
            <h3 className="text-body font-semibold mb-[var(--space-3)]">Correct Quantity</h3>
            <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-2)]">
              Current: {correctDialog.currentQty}
            </p>
            <input
              type="number"
              min={1}
              value={newQty}
              onChange={(e) => setNewQty(Math.max(1, Number(e.target.value)))}
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-body mb-[var(--space-3)]"
            />
            <div className="flex gap-[var(--space-2)]">
              <button
                onClick={() => setCorrectDialog(null)}
                className="flex-1 rounded-lg border border-[var(--border-default)] px-3 py-2.5 text-body active:scale-[0.97]"
              >
                Cancel
              </button>
              <button
                onClick={handleCorrect}
                disabled={isPending}
                className="flex-1 rounded-lg bg-[var(--color-info)] px-3 py-2.5 text-body font-medium text-white disabled:opacity-50 active:scale-[0.97]"
              >
                Correct
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
