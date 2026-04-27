"use client";

import { useState, useTransition } from "react";
import { createInvite, revokeInvite } from "@/actions/auth.actions";
import { InviteLinkDisplay } from "./invite-link-display";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";

interface PendingInvite {
  id: string;
  code: string;
  createdAt: Date;
  expiresAt: Date;
}

export function InviteSection({
  initialInvites,
}: {
  initialInvites: PendingInvite[];
}) {
  const { toast } = useToast();
  const [invites, setInvites] = useState(initialInvites);
  const [newInviteUrl, setNewInviteUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreateInvite() {
    startTransition(async () => {
      const result = await createInvite();
      if (result.success) {
        setNewInviteUrl(result.data.url);
        toast("Invite created");
        // Refresh invite list
        const { getPendingInvites } = await import("@/actions/auth.actions");
        const updated = await getPendingInvites();
        if (updated.success) {
          setInvites(updated.data);
        }
      } else {
        toast(result.error);
      }
    });
  }

  function handleRevoke(inviteId: string) {
    startTransition(async () => {
      const result = await revokeInvite(inviteId);
      if (result.success) {
        setInvites((prev) => prev.filter((i) => i.id !== inviteId));
        toast("Invite revoked");
      } else {
        toast(result.error);
      }
    });
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-[var(--space-3)]">
        <h2 className="text-value">Invitations</h2>
        <Button
          onClick={handleCreateInvite}
          disabled={isPending}
          className="touch-target text-meta bg-[var(--color-info)] text-white hover:bg-[var(--color-info)]/90"
        >
          {isPending ? "Creating..." : "Invite Staff"}
        </Button>
      </div>

      {newInviteUrl && (
        <div className="mb-[var(--space-4)]">
          <InviteLinkDisplay
            url={newInviteUrl}
            onDismiss={() => setNewInviteUrl(null)}
          />
        </div>
      )}

      {invites.length === 0 ? (
        <p className="text-meta text-[var(--text-secondary)]">
          No pending invites.
        </p>
      ) : (
        <div className="space-y-[var(--space-2)]">
          {invites.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between rounded-lg border border-[var(--border-default)] p-[var(--space-3)]"
            >
              <div>
                <p className="text-meta font-mono text-[var(--text-primary)]">
                  {invite.code.slice(0, 8)}...
                </p>
                <p className="text-meta text-[var(--text-secondary)]">
                  Expires{" "}
                  {new Date(invite.expiresAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => handleRevoke(invite.id)}
                disabled={isPending}
                className="touch-target text-meta text-[var(--color-urgent)] hover:underline"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
