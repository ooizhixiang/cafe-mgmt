import type { Role } from "@/generated/prisma/enums";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      cafeId: string;
      isActive: boolean;
      mustChangePassword: boolean;
      templateSelected: string | null;
    };
  }

  interface User {
    role: Role;
    cafeId: string;
    isActive: boolean;
    mustChangePassword: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    cafeId: string;
    isActive: boolean;
    mustChangePassword: boolean;
  }
}
