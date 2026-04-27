"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { register } from "@/actions/auth.actions";
import { Button } from "@/components/ui/button";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);

    const result = await register(formData);

    if (result.success) {
      router.push("/");
      router.refresh();
    } else {
      setError(result.error);
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-6)] animate-slide-up" style={{ boxShadow: "var(--shadow-lg)" }}>
      <h1 className="text-headline mb-[var(--space-2)]">Create Account</h1>
      <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-6)]">Set up your cafe in minutes</p>

      <form onSubmit={handleSubmit} className="space-y-[var(--space-4)]">
        <div>
          <label
            htmlFor="name"
            className="text-meta block mb-[var(--space-1)] font-medium text-[var(--text-primary)]"
          >
            Name *
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className={`w-full rounded-md border px-3 py-2 text-body focus-ring ${
              fieldErrors.name
                ? "border-[var(--color-urgent)]"
                : "border-[var(--border-default)]"
            }`}
          />
          {fieldErrors.name && (
            <p className="text-meta text-[var(--color-urgent)] mt-[var(--space-1)]">
              {fieldErrors.name}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="email"
            className="text-meta block mb-[var(--space-1)] font-medium text-[var(--text-primary)]"
          >
            Email *
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className={`w-full rounded-md border px-3 py-2 text-body focus-ring ${
              fieldErrors.email
                ? "border-[var(--color-urgent)]"
                : "border-[var(--border-default)]"
            }`}
          />
          {fieldErrors.email && (
            <p className="text-meta text-[var(--color-urgent)] mt-[var(--space-1)]">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="password"
            className="text-meta block mb-[var(--space-1)] font-medium text-[var(--text-primary)]"
          >
            Password *
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            className={`w-full rounded-md border px-3 py-2 text-body focus-ring ${
              fieldErrors.password
                ? "border-[var(--color-urgent)]"
                : "border-[var(--border-default)]"
            }`}
          />
          <p className="text-meta text-[var(--text-secondary)] mt-[var(--space-1)]">
            At least 8 characters
          </p>
          {fieldErrors.password && (
            <p className="text-meta text-[var(--color-urgent)] mt-[var(--space-1)]">
              {fieldErrors.password}
            </p>
          )}
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

      <p className="text-meta text-[var(--text-secondary)] text-center mt-[var(--space-4)]">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-[var(--color-info)] hover:underline"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
