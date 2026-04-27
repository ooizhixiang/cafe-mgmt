"use client";

interface StaleValueDialogProps {
  ingredientName: string;
  currentValue: number;
  myValue: number;
  onAcceptCurrent: () => void;
  onUseMine: () => void;
  onClose: () => void;
}

export function StaleValueDialog({
  ingredientName,
  currentValue,
  myValue,
  onAcceptCurrent,
  onUseMine,
  onClose,
}: StaleValueDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-[var(--space-4)]">
      <div className="w-full max-w-[320px] rounded-lg bg-[var(--bg-primary)] p-[var(--space-5)] shadow-xl">
        <h3 className="text-body font-semibold mb-[var(--space-2)]">
          Value Updated
        </h3>
        <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-4)]">
          {ingredientName} was updated by someone else while you were editing.
        </p>

        <div className="flex justify-between text-body mb-[var(--space-4)]">
          <div>
            <p className="text-meta text-[var(--text-secondary)]">Current</p>
            <p className="font-semibold">{currentValue}</p>
          </div>
          <div className="text-right">
            <p className="text-meta text-[var(--text-secondary)]">Your value</p>
            <p className="font-semibold">{myValue}</p>
          </div>
        </div>

        <div className="flex gap-[var(--space-2)]">
          <button
            onClick={() => {
              onAcceptCurrent();
              onClose();
            }}
            className="flex-1 rounded-lg border border-[var(--border-default)] px-3 py-2 text-body font-medium"
          >
            Accept current
          </button>
          <button
            onClick={() => {
              onUseMine();
              onClose();
            }}
            className="flex-1 rounded-lg bg-[var(--color-info)] px-3 py-2 text-body font-medium text-white"
          >
            Use mine
          </button>
        </div>
      </div>
    </div>
  );
}
