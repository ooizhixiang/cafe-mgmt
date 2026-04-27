export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

export type { Role } from "@/generated/prisma/enums";
