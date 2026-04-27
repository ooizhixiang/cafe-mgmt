"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { login } from "@/actions/auth.actions";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);

    const result = await login(formData);

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
      <h1 className="text-headline mb-[var(--space-2)]">Welcome back</h1>
      <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-6)]">Sign in to your account</p>

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
            className="w-full rounded-md border border-[var(--border-default)] px-3 py-2 text-body focus-ring"
          />
        </div>

        <div className="text-right">
          <Link
            href="/forgot-password"
            className="text-meta text-[var(--color-info)] hover:underline"
          >
            Forgot password?
          </Link>
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
          {isSubmitting ? "Logging in..." : "Log In"}
        </Button>
      </form>

      <p className="text-meta text-[var(--text-secondary)] text-center mt-[var(--space-4)]">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="text-[var(--color-info)] hover:underline"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
