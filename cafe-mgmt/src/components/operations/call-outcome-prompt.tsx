"use client";

import { PackageCheck, PhoneOff, PhoneForwarded } from "lucide-react";

export type CallOutcome = "ORDERED" | "NO_ANSWER" | "CALL_BACK";

interface CallOutcomePromptProps {
  onSelect: (outcome: CallOutcome) => void;
  onClose: () => void;
}

const OUTCOMES = [
  { value: "ORDERED" as const, label: "Ordered", icon: PackageCheck },
  { value: "NO_ANSWER" as const, label: "No Answer", icon: PhoneOff },
  { value: "CALL_BACK" as const, label: "Call Back", icon: PhoneForwarded },
];

export function CallOutcomePrompt({
  onSelect,
  onClose,
}: CallOutcomePromptProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm p-[var(--space-4)] animate-[fadeIn_0.15s_ease-out]">
      <div className="w-full max-w-[480px] rounded-t-2xl bg-[var(--bg-primary)] p-[var(--space-5)]" style={{ boxShadow: "var(--shadow-lg)" }}>
        <h3 className="text-body font-semibold mb-[var(--space-3)] text-center">
          How did the call go?
        </h3>

        <div className="grid grid-cols-3 gap-[var(--space-3)]">
          {OUTCOMES.map((o) => (
            <button
              key={o.value}
              onClick={() => onSelect(o.value)}
              className="touch-target flex flex-col items-center gap-[var(--space-2)] rounded-lg border border-[var(--border-default)] p-[var(--space-3)] active:scale-[0.97] active:bg-[var(--bg-secondary)]"
              style={{ boxShadow: "var(--shadow-sm)" }}
            >
              <o.icon size={28} strokeWidth={1.5} className="text-[var(--text-secondary)]" />
              <span className="text-meta font-medium">{o.label}</span>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full mt-[var(--space-3)] rounded-lg border border-[var(--border-default)] px-3 py-2.5 text-body font-medium text-[var(--text-secondary)] active:bg-[var(--bg-secondary)]"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
