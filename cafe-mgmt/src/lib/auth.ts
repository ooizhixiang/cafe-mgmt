import { auth } from "../../auth";
import type { Role } from "@/generated/prisma/enums";

export { auth };

export async function requireRole(requiredRole: Role) {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthenticated");
  }
  if (!session.user.isActive) {
    throw new Error("Account deactivated");
  }
  if (session.user.role !== requiredRole) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthenticated");
  }
  if (!session.user.isActive) {
    throw new Error("Account deactivated");
  }
  return session;
}
