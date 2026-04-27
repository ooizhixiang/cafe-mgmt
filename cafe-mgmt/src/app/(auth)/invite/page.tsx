"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function InviteCodeEntryPage() {
  const router = useRouter();
  const [code, setCode] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (trimmed) {
      router.push(`/invite/${trimmed}`);
    }
  }

  return (
    <div className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-6)] shadow-sm border border-[var(--border-default)]">
      <h1 className="text-headline mb-[var(--space-2)]">Join Your Team</h1>
      <p className="text-body text-[var(--text-secondary)] mb-[var(--space-6)]">
        Enter the invite code your manager shared with you.
      </p>

      <form onSubmit={handleSubmit} className="space-y-[var(--space-4)]">
        <div>
          <label
            htmlFor="code"
            className="text-meta block mb-[var(--space-1)] font-medium text-[var(--text-primary)]"
          >
            Invite Code
          </label>
          <input
            id="code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste your invite code"
            required
            className="w-full rounded-md border border-[var(--border-default)] px-3 py-2 text-body focus-ring"
          />
        </div>

        <Button
          type="submit"
          className="w-full touch-target text-body bg-[var(--color-info)] text-white hover:bg-[var(--color-info)]/90"
        >
          Continue
        </Button>
      </form>
    </div>
  );
}
