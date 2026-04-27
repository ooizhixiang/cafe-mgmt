"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signIn, signOut } from "../../auth";
import { logError } from "@/lib/log-error";
import {
  BRUTE_FORCE_MAX_ATTEMPTS,
  BRUTE_FORCE_LOCKOUT_MINUTES,
} from "@/lib/constants";
import { requireRole, requireAuth } from "@/lib/auth";
import type { ActionResult } from "@/types";
import crypto from "crypto";

const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export async function register(
  formData: FormData
): Promise<ActionResult<{ userId: string }>> {
  try {
    const raw = {
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    };

    const parsed = registerSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const { name, email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    // Check for existing user
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      return {
        success: false,
        error: "An account with this email already exists",
      };
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Create user + cafe in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      const cafe = await tx.cafe.create({
        data: { name: `${name}'s Cafe` },
      });

      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name,
          role: "MANAGER",
          cafeId: cafe.id,
          isActive: true,
        },
      });

      return { userId: user.id, cafeId: cafe.id };
    });

    // Auto-login after registration
    await signIn("credentials", {
      email: normalizedEmail,
      password,
      redirect: false,
    });

    return { success: true, data: { userId: result.userId } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Registration failed";
    await logError({ context: "register", message });
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

export async function login(
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    const raw = {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    };

    const parsed = loginSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const { email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    // Check brute force lockout before attempting sign in
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        lockedUntil: true,
        failedLoginAttempts: true,
        isActive: true,
      },
    });

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      return {
        success: false,
        error: "Too many attempts. Try again in 15 minutes.",
      };
    }

    if (user && !user.isActive) {
      return {
        success: false,
        error: "Your account has been deactivated. Contact your manager.",
      };
    }

    const result = await signIn("credentials", {
      email: normalizedEmail,
      password,
      redirect: false,
    });

    if (!result) {
      return { success: false, error: "Invalid email or password" };
    }

    return { success: true, data: undefined };
  } catch (error) {
    // Auth.js throws on failed credentials
    if (
      error instanceof Error &&
      error.message.includes("CredentialsSignin")
    ) {
      return { success: false, error: "Invalid email or password" };
    }
    const message = error instanceof Error ? error.message : "Login failed";
    await logError({ context: "login", message });
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

export async function logout(): Promise<void> {
  await signOut({ redirect: false });
}

// --- Invite Actions (Story 1.2) ---

const MAX_PENDING_INVITES = 20;
const INVITE_EXPIRY_DAYS = 7;

const UNAMBIGUOUS_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function generateTempPassword(length = 12): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(
    array,
    (byte) => UNAMBIGUOUS_CHARS[byte % UNAMBIGUOUS_CHARS.length]
  ).join("");
}

export async function createInvite(): Promise<
  ActionResult<{ code: string; url: string }>
> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    // Check pending invite count
    const pendingCount = await prisma.invite.count({
      where: {
        cafeId,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (pendingCount >= MAX_PENDING_INVITES) {
      return {
        success: false,
        error:
          "Maximum 20 pending invites reached. Revoke old invites to create new ones.",
      };
    }

    const code = crypto.randomUUID();
    const expiresAt = new Date(
      Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    await prisma.invite.create({
      data: {
        code,
        cafeId,
        role: "STAFF",
        expiresAt,
      },
    });

    const baseUrl = process.env.AUTH_URL || "http://localhost:50000";
    const url = `${baseUrl}/invite/${code}`;

    return { success: true, data: { code, url } };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message =
      error instanceof Error ? error.message : "Failed to create invite";
    await logError({ context: "createInvite", message });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function revokeInvite(
  inviteId: string
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const invite = await prisma.invite.findUnique({
      where: { id: inviteId },
    });

    if (!invite || invite.cafeId !== cafeId) {
      return { success: false, error: "Invite not found" };
    }

    if (invite.usedAt || invite.revokedAt) {
      return { success: false, error: "Invite is already used or revoked" };
    }

    await prisma.invite.update({
      where: { id: inviteId },
      data: { revokedAt: new Date() },
    });

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message =
      error instanceof Error ? error.message : "Failed to revoke invite";
    await logError({ context: "revokeInvite", message });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function getPendingInvites(): Promise<
  ActionResult<
    Array<{ id: string; code: string; createdAt: Date; expiresAt: Date }>
  >
> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const invites = await prisma.invite.findMany({
      where: {
        cafeId,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, code: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: invites };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

// --- Invite Registration (Story 1.2) ---

const registerViaInviteSchema = z.object({
  code: z.string().min(1, "Invite code is required"),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function registerViaInvite(
  formData: FormData
): Promise<ActionResult<{ userId: string }>> {
  try {
    const raw = {
      code: formData.get("code") as string,
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    };

    const parsed = registerViaInviteSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const { code, name, email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase();
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      // Find valid invite
      const invite = await tx.invite.findFirst({
        where: {
          code,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

      if (!invite) {
        // Determine specific error
        const anyInvite = await tx.invite.findUnique({ where: { code } });
        if (!anyInvite) throw new Error("INVALID_CODE");
        if (anyInvite.usedAt) throw new Error("ALREADY_USED");
        if (anyInvite.revokedAt) throw new Error("REVOKED");
        if (anyInvite.expiresAt <= new Date()) throw new Error("EXPIRED");
        throw new Error("INVALID_CODE");
      }

      // Check duplicate email
      const existing = await tx.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (existing) throw new Error("DUPLICATE_EMAIL");

      // Create user
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name,
          role: invite.role,
          cafeId: invite.cafeId,
          isActive: true,
          mustChangePassword: false,
        },
      });

      // Mark invite as used
      await tx.invite.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      });

      return { userId: user.id };
    });

    // Auto-login after registration
    await signIn("credentials", {
      email: normalizedEmail,
      password,
      redirect: false,
    });

    return { success: true, data: result };
  } catch (error) {
    if (error instanceof Error) {
      switch (error.message) {
        case "INVALID_CODE":
          return { success: false, error: "Invalid invite link" };
        case "ALREADY_USED":
          return {
            success: false,
            error: "This invite has already been used",
          };
        case "REVOKED":
          return { success: false, error: "This invite has been revoked" };
        case "EXPIRED":
          return { success: false, error: "This invite has expired" };
        case "DUPLICATE_EMAIL":
          return {
            success: false,
            error: "An account with this email already exists",
          };
      }
    }
    const message =
      error instanceof Error ? error.message : "Registration failed";
    await logError({ context: "registerViaInvite", message });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

// --- Staff Management Actions (Story 1.2) ---

export async function getStaffList(): Promise<
  ActionResult<
    Array<{
      id: string;
      name: string;
      email: string;
      role: string;
      isActive: boolean;
    }>
  >
> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const staff = await prisma.user.findMany({
      where: { cafeId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return { success: true, data: staff };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function resetStaffPassword(
  userId: string
): Promise<ActionResult<{ tempPassword: string }>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { cafeId: true, isActive: true },
    });

    if (!targetUser || targetUser.cafeId !== cafeId) {
      return { success: false, error: "User not found" };
    }

    if (!targetUser.isActive) {
      return {
        success: false,
        error: "Cannot reset password for a deactivated user",
      };
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: true,
      },
    });

    return { success: true, data: { tempPassword } };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message =
      error instanceof Error ? error.message : "Failed to reset password";
    await logError({ context: "resetStaffPassword", message });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function deactivateUser(
  userId: string
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    // Prevent self-deactivation
    if (userId === session.user.id) {
      return { success: false, error: "You cannot deactivate your own account" };
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { cafeId: true, role: true, isActive: true },
    });

    if (!targetUser || targetUser.cafeId !== cafeId) {
      return { success: false, error: "User not found" };
    }

    // Prevent deactivating the last active manager
    if (targetUser.role === "MANAGER") {
      const activeManagerCount = await prisma.user.count({
        where: { cafeId, role: "MANAGER", isActive: true },
      });
      if (activeManagerCount <= 1) {
        return {
          success: false,
          error: "Cannot deactivate the last active manager",
        };
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message =
      error instanceof Error ? error.message : "Failed to deactivate user";
    await logError({ context: "deactivateUser", message });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function reactivateUser(
  userId: string
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { cafeId: true },
    });

    if (!targetUser || targetUser.cafeId !== cafeId) {
      return { success: false, error: "User not found" };
    }

    await prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
    });

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message =
      error instanceof Error ? error.message : "Failed to reactivate user";
    await logError({ context: "reactivateUser", message });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

// --- Change Password (Story 1.2) ---

const changePasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export async function changePassword(
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    const session = await requireAuth();

    const parsed = changePasswordSchema.safeParse({
      newPassword: formData.get("newPassword") as string,
    });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    });

    return { success: true, data: undefined };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to change password";
    await logError({ context: "changePassword", message });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

// --- Invite Validation Helper (Story 1.2) ---

// --- Forgot Password (Self-Service Reset) ---

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email format"),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const PASSWORD_RESET_EXPIRY_MINUTES = 60;

export async function requestPasswordReset(
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    const parsed = forgotPasswordSchema.safeParse({
      email: formData.get("email") as string,
    });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const normalizedEmail = parsed.data.email.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, isActive: true },
    });

    if (!user) {
      return { success: false, error: "No account found with this email address" };
    }

    if (!user.isActive) {
      return { success: false, error: "This account has been deactivated. Contact your manager." };
    }

    // Invalidate any existing tokens for this email
    await prisma.passwordResetToken.updateMany({
      where: { email: normalizedEmail, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = crypto.randomUUID();
    const expiresAt = new Date(
      Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000
    );

    await prisma.passwordResetToken.create({
      data: { token, email: normalizedEmail, expiresAt },
    });

    const baseUrl = process.env.AUTH_URL || "http://localhost:40000";
    const resetUrl = `${baseUrl}/reset-password/${token}`;

    // Log to console — replace with email service in production
    console.log(`\n🔑 Password reset link for ${normalizedEmail}:\n${resetUrl}\n`);

    return { success: true, data: undefined };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to request password reset";
    await logError({ context: "requestPasswordReset", message });
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

export async function resetPassword(
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    const parsed = resetPasswordSchema.safeParse({
      token: formData.get("token") as string,
      password: formData.get("password") as string,
    });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const { token, password } = parsed.data;

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken) {
      return { success: false, error: "Invalid or expired reset link" };
    }

    if (resetToken.usedAt) {
      return { success: false, error: "This reset link has already been used" };
    }

    if (resetToken.expiresAt <= new Date()) {
      return { success: false, error: "This reset link has expired" };
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { email: resetToken.email },
        data: {
          passwordHash,
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });

      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      });
    });

    return { success: true, data: undefined };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reset password";
    await logError({ context: "resetPassword", message });
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

export async function validateResetToken(
  token: string
): Promise<ActionResult<{ valid: boolean; error?: string }>> {
  try {
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken) {
      return { success: true, data: { valid: false, error: "Invalid reset link" } };
    }
    if (resetToken.usedAt) {
      return { success: true, data: { valid: false, error: "This reset link has already been used" } };
    }
    if (resetToken.expiresAt <= new Date()) {
      return { success: true, data: { valid: false, error: "This reset link has expired" } };
    }

    return { success: true, data: { valid: true } };
  } catch {
    return { success: false, error: "Something went wrong" };
  }
}

export async function validateInviteCode(
  code: string
): Promise<
  ActionResult<{ valid: boolean; error?: string }>
> {
  try {
    const invite = await prisma.invite.findUnique({ where: { code } });

    if (!invite) {
      return { success: true, data: { valid: false, error: "Invalid invite link" } };
    }
    if (invite.usedAt) {
      return { success: true, data: { valid: false, error: "This invite has already been used" } };
    }
    if (invite.revokedAt) {
      return { success: true, data: { valid: false, error: "This invite has been revoked" } };
    }
    if (invite.expiresAt <= new Date()) {
      return { success: true, data: { valid: false, error: "This invite has expired" } };
    }

    return { success: true, data: { valid: true } };
  } catch {
    return { success: false, error: "Something went wrong" };
  }
}
