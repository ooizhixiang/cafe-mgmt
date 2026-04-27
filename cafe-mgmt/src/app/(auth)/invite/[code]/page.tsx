import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { InviteRegistrationForm } from "./invite-registration-form";

interface Props {
  params: Promise<{ code: string }>;
}

export default async function InviteRegistrationPage({ params }: Props) {
  const { code } = await params;

  // If already authenticated, redirect home
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  // Validate invite server-side
  const invite = await prisma.invite.findUnique({ where: { code } });

  if (!invite) {
    return (
      <div className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-6)] shadow-sm border border-[var(--border-default)] text-center">
        <p className="text-body text-[var(--color-urgent)]">
          Invalid invite link
        </p>
      </div>
    );
  }

  if (invite.usedAt) {
    return (
      <div className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-6)] shadow-sm border border-[var(--border-default)] text-center">
        <p className="text-body text-[var(--color-urgent)]">
          This invite has already been used
        </p>
      </div>
    );
  }

  if (invite.revokedAt) {
    return (
      <div className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-6)] shadow-sm border border-[var(--border-default)] text-center">
        <p className="text-body text-[var(--color-urgent)]">
          This invite has been revoked
        </p>
      </div>
    );
  }

  if (invite.expiresAt <= new Date()) {
    return (
      <div className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-6)] shadow-sm border border-[var(--border-default)] text-center">
        <p className="text-body text-[var(--color-urgent)]">
          This invite has expired
        </p>
      </div>
    );
  }

  return <InviteRegistrationForm code={code} />;
}
