"use client";

import { useState } from "react";

export function InviteLinkDisplay({
  url,
  onDismiss,
}: {
  url: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — user can select text manually
    }
  }

  return (
    <div className="rounded-lg border border-[var(--border-default)] p-[var(--space-4)] bg-[var(--bg-secondary)]">
      <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-2)]">
        Share this link with your staff member:
      </p>
      <input
        type="text"
        readOnly
        value={url}
        className="w-full rounded-md border border-[var(--border-default)] px-3 py-2 text-meta bg-[var(--bg-primary)] select-all mb-[var(--space-3)]"
        onClick={(e) => (e.target as HTMLInputElement).select()}
      />
      <div className="flex gap-[var(--space-2)]">
        <button
          onClick={copyToClipboard}
          className="touch-target px-3 py-2 rounded-lg text-meta border border-[var(--color-info)] text-[var(--color-info)] hover:bg-[var(--color-info)]/10"
        >
          {copied ? "Copied!" : "Copy Link"}
        </button>
        <button
          onClick={onDismiss}
          className="touch-target px-3 py-2 rounded-lg text-meta text-[var(--text-secondary)] hover:bg-[var(--bg-pressed)]"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
