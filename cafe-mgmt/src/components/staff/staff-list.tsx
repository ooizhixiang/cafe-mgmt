"use client";

import { useState, useTransition } from "react";
import {
  resetStaffPassword,
  deactivateUser,
  reactivateUser,
} from "@/actions/auth.actions";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useToast } from "@/components/ui/toast";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

export function StaffList({
  initialStaff,
  currentUserId,
}: {
  initialStaff: StaffMember[];
  currentUserId: string;
}) {
  const { toast } = useToast();
  const [staff, setStaff] = useState(initialStaff);
  const [isPending, startTransition] = useTransition();
  const [tempPassword, setTempPassword] = useState<{
    userId: string;
    password: string;
  } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    type: "deactivate" | "resetPassword";
    userId: string;
    userName: string;
  } | null>(null);

  function handleResetPassword(userId: string) {
    startTransition(async () => {
      const result = await resetStaffPassword(userId);
      if (result.success) {
        setTempPassword({ userId, password: result.data.tempPassword });
        toast(
          "Password reset. Share the temporary password with your staff member."
        );
      } else {
        toast(result.error);
      }
    });
    setConfirmDialog(null);
  }

  function handleDeactivate(userId: string) {
    startTransition(async () => {
      const result = await deactivateUser(userId);
      if (result.success) {
        setStaff((prev) =>
          prev.map((s) => (s.id === userId ? { ...s, isActive: false } : s))
        );
        toast("Staff member deactivated");
      } else {
        toast(result.error);
      }
    });
    setConfirmDialog(null);
  }

  function handleReactivate(userId: string) {
    startTransition(async () => {
      const result = await reactivateUser(userId);
      if (result.success) {
        setStaff((prev) =>
          prev.map((s) => (s.id === userId ? { ...s, isActive: true } : s))
        );
        toast("Staff member reactivated");
      } else {
        toast(result.error);
      }
    });
  }

  // Filter out current user from staff list display
  const otherStaff = staff.filter((s) => s.id !== currentUserId);

  if (otherStaff.length === 0) {
    return (
      <section>
        <h2 className="text-value mb-[var(--space-3)]">Staff</h2>
        <div className="flex flex-col items-center justify-center py-[var(--space-8)] text-center">
          <Users
            size={48}
            className="text-[var(--text-disabled)] mb-[var(--space-3)]"
          />
          <p className="text-body text-[var(--text-secondary)] mb-[var(--space-4)]">
            No staff yet. Invite your first team member.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-value mb-[var(--space-3)]">Staff</h2>
      <div className="space-y-[var(--space-3)]">
        {otherStaff.map((member) => (
          <div
            key={member.id}
            className="rounded-lg border border-[var(--border-default)] p-[var(--space-4)]"
          >
            <div className="flex items-start justify-between mb-[var(--space-2)]">
              <div>
                <p className="text-body font-medium">{member.name}</p>
                <p className="text-meta text-[var(--text-secondary)]">
                  {member.email}
                </p>
              </div>
              <span
                className={`text-meta px-2 py-0.5 rounded-full ${
                  member.isActive
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {member.isActive ? "Active" : "Deactivated"}
              </span>
            </div>

            {/* Temp password display */}
            {tempPassword?.userId === member.id && (
              <div className="rounded-lg border border-[var(--border-default)] p-[var(--space-3)] bg-[var(--bg-secondary)] mb-[var(--space-3)]">
                <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-1)]">
                  Temporary password:
                </p>
                <input
                  type="text"
                  readOnly
                  value={tempPassword.password}
                  className="w-full rounded-md border border-[var(--border-default)] px-3 py-2 text-meta font-mono bg-[var(--bg-primary)] select-all mb-[var(--space-2)]"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={() => setTempPassword(null)}
                  className="text-meta text-[var(--text-secondary)] hover:underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="flex gap-[var(--space-2)] flex-wrap">
              {member.isActive && (
                <>
                  <button
                    onClick={() =>
                      setConfirmDialog({
                        type: "resetPassword",
                        userId: member.id,
                        userName: member.name,
                      })
                    }
                    disabled={isPending}
                    className="touch-target px-3 py-2 rounded-lg text-meta border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
                  >
                    Reset Password
                  </button>
                  <button
                    onClick={() =>
                      setConfirmDialog({
                        type: "deactivate",
                        userId: member.id,
                        userName: member.name,
                      })
                    }
                    disabled={isPending}
                    className="touch-target px-3 py-2 rounded-lg text-meta bg-[var(--color-urgent)] text-white hover:bg-[var(--color-urgent)]/90"
                  >
                    Deactivate
                  </button>
                </>
              )}
              {!member.isActive && (
                <Button
                  onClick={() => handleReactivate(member.id)}
                  disabled={isPending}
                  variant="outline"
                  className="touch-target text-meta"
                >
                  Reactivate
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {confirmDialog?.type === "deactivate" && (
        <ConfirmationDialog
          open
          title="Deactivate Staff Member"
          message={`Are you sure you want to deactivate ${confirmDialog.userName}? They will be logged out immediately and unable to access the app.`}
          confirmLabel="Deactivate"
          destructive
          onConfirm={() => handleDeactivate(confirmDialog.userId)}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {confirmDialog?.type === "resetPassword" && (
        <ConfirmationDialog
          open
          title="Reset Password"
          message={`Reset ${confirmDialog.userName}'s password? They will be logged out and must use the temporary password to sign in.`}
          confirmLabel="Reset"
          onConfirm={() => handleResetPassword(confirmDialog.userId)}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </section>
  );
}
