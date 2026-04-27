import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

/**
 * Auth.js v5 configuration.
 *
 * Uses JWT strategy (required for Credentials provider in Auth.js v5).
 * Instant session invalidation (NFR15) is achieved by checking isActive
 * from the database on every session() callback invocation.
 *
 * IMPORTANT: Prisma is imported dynamically in callbacks to avoid
 * pulling Node.js modules into Edge Runtime (middleware).
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const { prisma } = await import("@/lib/db");
        const bcrypt = (await import("bcryptjs")).default;
        const { BRUTE_FORCE_MAX_ATTEMPTS, BRUTE_FORCE_LOCKOUT_MINUTES } =
          await import("@/lib/constants");

        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });

        if (!user) return null;

        // Brute force check
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          return null;
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);

        if (!isValid) {
          const newAttempts = user.failedLoginAttempts + 1;
          const updateData: {
            failedLoginAttempts: number;
            lockedUntil?: Date;
          } = { failedLoginAttempts: newAttempts };

          if (newAttempts >= BRUTE_FORCE_MAX_ATTEMPTS) {
            updateData.lockedUntil = new Date(
              Date.now() + BRUTE_FORCE_LOCKOUT_MINUTES * 60 * 1000
            );
          }

          await prisma.user.update({
            where: { id: user.id },
            data: updateData,
          });

          return null;
        }

        if (!user.isActive) return null;

        // Reset failed attempts on success
        if (user.failedLoginAttempts > 0) {
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: 0, lockedUntil: null },
          });
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          cafeId: user.cafeId,
          isActive: user.isActive,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      // On sign-in, persist user fields into the JWT
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.cafeId = user.cafeId;
        token.isActive = user.isActive;
        token.mustChangePassword = user.mustChangePassword;
      }
      return token;
    },
    async session({ session, token }) {
      // Check isActive and mustChangePassword from DB for instant invalidation (NFR15)
      const { prisma } = await import("@/lib/db");
      const dbUser = await prisma.user.findUnique({
        where: { id: token.id as string },
        select: {
          id: true,
          role: true,
          cafeId: true,
          isActive: true,
          mustChangePassword: true,
          cafe: { select: { templateSelected: true } },
        },
      });

      if (dbUser) {
        session.user.id = dbUser.id;
        session.user.role = dbUser.role;
        session.user.cafeId = dbUser.cafeId;
        session.user.isActive = dbUser.isActive;
        session.user.mustChangePassword = dbUser.mustChangePassword;
        session.user.templateSelected = dbUser.cafe?.templateSelected ?? null;
      }

      return session;
    },
  },
});
