"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { changePassword } from "@/actions/auth.actions";
import { Button } from "@/components/ui/button";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsSubmitting(true);

    const result = await changePassword(formData);

    if (result.success) {
      router.push("/");
      router.refresh();
    } else {
      setError(result.error);
      setIsSubmitting(false);
    }
  }

  return (
    <div className="p-[var(--space-4)] lg:p-8 lg:pt-10 lg:max-w-[960px] lg:mx-auto">
      <div className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-6)] shadow-sm border border-[var(--border-default)]">
        <h1 className="text-headline mb-[var(--space-2)]">Change Password</h1>
        <p className="text-body text-[var(--text-secondary)] mb-[var(--space-6)]">
          You must set a new password before continuing.
        </p>

        <form onSubmit={handleSubmit} className="space-y-[var(--space-4)]">
          <div>
            <label
              htmlFor="newPassword"
              className="text-meta block mb-[var(--space-1)] font-medium text-[var(--text-primary)]"
            >
              New Password
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              minLength={8}
              className="w-full rounded-md border border-[var(--border-default)] px-3 py-2 text-body focus-ring"
            />
            <p className="text-meta text-[var(--text-secondary)] mt-[var(--space-1)]">
              At least 8 characters
            </p>
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="text-meta block mb-[var(--space-1)] font-medium text-[var(--text-primary)]"
            >
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              className="w-full rounded-md border border-[var(--border-default)] px-3 py-2 text-body focus-ring"
            />
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
            {isSubmitting ? "Saving..." : "Set New Password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
