"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { resetPassword, validateResetToken } from "@/actions/auth.actions";
import { Button } from "@/components/ui/button";

export default function ResetPasswordPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [error, setError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function checkToken() {
      const result = await validateResetToken(token);
      if (result.success && !result.data.valid) {
        setTokenError(result.data.error || "Invalid reset link");
      } else if (!result.success) {
        setTokenError("Something went wrong");
      }
      setIsValidating(false);
    }
    checkToken();
  }, [token]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    formData.append("token", token);

    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setIsSubmitting(false);
      return;
    }

    const result = await resetPassword(formData);

    if (result.success) {
      setSuccess(true);
    } else {
      setError(result.error);
      setIsSubmitting(false);
    }
  }

  if (isValidating) {
    return (
      <div className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-6)] animate-slide-up" style={{ boxShadow: "var(--shadow-lg)" }}>
        <p className="text-body text-[var(--text-secondary)] text-center">Validating reset link...</p>
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-6)] animate-slide-up" style={{ boxShadow: "var(--shadow-lg)" }}>
        <h1 className="text-headline mb-[var(--space-2)]">Invalid link</h1>
        <p className="text-body text-[var(--text-secondary)] mb-[var(--space-6)]">{tokenError}</p>
        <Link
          href="/forgot-password"
          className="text-[var(--color-info)] hover:underline text-body"
        >
          Request a new reset link
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-6)] animate-slide-up" style={{ boxShadow: "var(--shadow-lg)" }}>
        <h1 className="text-headline mb-[var(--space-2)]">Password reset</h1>
        <p className="text-body text-[var(--text-secondary)] mb-[var(--space-6)]">
          Your password has been reset successfully.
        </p>
        <Button
          onClick={() => router.push("/login")}
          className="w-full touch-target text-body bg-[var(--color-info)] text-white hover:bg-[var(--color-info)]/90"
        >
          Go to login
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-6)] animate-slide-up" style={{ boxShadow: "var(--shadow-lg)" }}>
      <h1 className="text-headline mb-[var(--space-2)]">Set new password</h1>
      <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-6)]">
        Enter your new password below.
      </p>

      <form onSubmit={handleSubmit} className="space-y-[var(--space-4)]">
        <div>
          <label
            htmlFor="password"
            className="text-meta block mb-[var(--space-1)] font-medium text-[var(--text-primary)]"
          >
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            className="w-full rounded-md border border-[var(--border-default)] px-3 py-2 text-body focus-ring"
          />
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="text-meta block mb-[var(--space-1)] font-medium text-[var(--text-primary)]"
          >
            Confirm password
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
          {isSubmitting ? "Resetting..." : "Reset Password"}
        </Button>
      </form>
    </div>
  );
}
