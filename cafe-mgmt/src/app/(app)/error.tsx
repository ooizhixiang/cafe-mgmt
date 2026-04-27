"use client";

import { Button } from "@/components/ui/button";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center p-[var(--space-4)]">
      <p className="text-body text-[var(--text-primary)] mb-[var(--space-4)]">
        Something went wrong.
      </p>
      <Button onClick={reset} className="touch-target">
        Refresh
      </Button>
    </div>
  );
}
