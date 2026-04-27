"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/actions/auth.actions";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const result = await requestPasswordReset(formData);

    if (result.success) {
      setSubmitted(true);
    } else {
      setError(result.error);
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-6)] animate-slide-up" style={{ boxShadow: "var(--shadow-lg)" }}>
        <h1 className="text-headline mb-[var(--space-2)]">Check your email</h1>
        <p className="text-body text-[var(--text-secondary)] mb-[var(--space-6)]">
          If an account exists with that email, we&apos;ve sent a password reset link. It will expire in 60 minutes.
        </p>
        <Link
          href="/login"
          className="text-[var(--color-info)] hover:underline text-body"
        >
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-6)] animate-slide-up" style={{ boxShadow: "var(--shadow-lg)" }}>
      <h1 className="text-headline mb-[var(--space-2)]">Forgot password?</h1>
      <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-6)]">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      <form onSubmit={handleSubmit} className="space-y-[var(--space-4)]">
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
          {isSubmitting ? "Sending..." : "Send Reset Link"}
        </Button>
      </form>

      <p className="text-meta text-[var(--text-secondary)] text-center mt-[var(--space-4)]">
        <Link
          href="/login"
          className="text-[var(--color-info)] hover:underline"
        >
          Back to login
        </Link>
      </p>
    </div>
  );
}
