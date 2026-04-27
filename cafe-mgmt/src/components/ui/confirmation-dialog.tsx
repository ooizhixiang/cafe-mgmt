"use client";

interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]"
      onClick={onCancel}
    >
      <div
        className="bg-[var(--bg-primary)] rounded-lg p-[var(--space-6)] mx-[var(--space-4)] max-w-sm w-full animate-[fadeIn_0.15s_ease-out]"
        style={{ boxShadow: "var(--shadow-lg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-value mb-[var(--space-2)]">{title}</h2>
        <p className="text-body text-[var(--text-secondary)] mb-[var(--space-6)]">
          {message}
        </p>
        <div className="flex gap-[var(--space-3)] justify-end">
          <button
            onClick={onCancel}
            className="touch-target px-5 py-2.5 rounded-lg text-body font-medium text-[var(--text-secondary)] active:bg-[var(--bg-secondary)]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`touch-target px-5 py-2.5 rounded-lg text-body font-medium text-white active:scale-[0.97] ${
              destructive
                ? "bg-[var(--color-urgent)]"
                : "bg-[var(--color-info)]"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
