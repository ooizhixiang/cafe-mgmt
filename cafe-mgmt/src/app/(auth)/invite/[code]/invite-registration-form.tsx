"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { registerViaInvite } from "@/actions/auth.actions";
import { Button } from "@/components/ui/button";

export function InviteRegistrationForm({ code }: { code: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    formData.set("code", code);

    const result = await registerViaInvite(formData);

    if (result.success) {
      router.push("/");
      router.refresh();
    } else {
      setError(result.error);
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-6)] shadow-sm border border-[var(--border-default)]">
      <h1 className="text-headline mb-[var(--space-2)]">Join Your Team</h1>
      <p className="text-body text-[var(--text-secondary)] mb-[var(--space-6)]">
        Create your account to get started.
      </p>

      <form onSubmit={handleSubmit} className="space-y-[var(--space-4)]">
        <div>
          <label
            htmlFor="name"
            className="text-meta block mb-[var(--space-1)] font-medium text-[var(--text-primary)]"
          >
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="w-full rounded-md border border-[var(--border-default)] px-3 py-2 text-body focus-ring"
          />
        </div>

        <div>
          <label
            htmlFor="email"
            className="text-meta block mb-[var(--space-1)] font-medium text-[var(--text-primary)]"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full rounded-md border border-[var(--border-default)] px-3 py-2 text-body focus-ring"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="text-meta block mb-[var(--space-1)] font-medium text-[var(--text-primary)]"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            className="w-full rounded-md border border-[var(--border-default)] px-3 py-2 text-body focus-ring"
          />
          <p className="text-meta text-[var(--text-secondary)] mt-[var(--space-1)]">
            At least 8 characters
          </p>
        </div>

        {error && (
          <p className="text-meta text-[var(--color-urgent)] bg-red-50 rounded-md p-[var(--space-3)]">
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full touch-target text-body bg-[var(--color-info)] text-white hover:bg-[var(--color-info)]/90"
        >
          {isSubmitting ? "Creating account..." : "Create Account"}
        </Button>
      </form>
    </div>
  );
}
