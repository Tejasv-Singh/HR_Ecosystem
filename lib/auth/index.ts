import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "@/lib/auth/config";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/modules/audit/service";
import { rateLimit } from "@/lib/rate-limit";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();

        // Per-account throttle. Complements the per-IP limit on the login route.
        if (!rateLimit(`login:${email}`, 10, 15 * 60 * 1000).ok) return null;

        const user = await prisma.user.findUnique({ where: { email } });

        // A pending invite has no password hash yet; treat it as a failed login
        // rather than revealing that the address is known.
        if (!user?.passwordHash || user.status !== "ACTIVE") return null;

        if (!(await verifyPassword(parsed.data.password, user.passwordHash))) return null;

        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

        // Audited here rather than in the route handlers. This is the one point
        // every successful credential sign-in passes through — the login form,
        // sign-up, and invitation acceptance all land here — and it is the only
        // place with the user in hand. A handler cannot do it after the fact:
        // `getActor()` reads the session cookie, which does not exist yet on the
        // request that creates it.
        await recordAudit(prisma, {
          actor: { userId: user.id, tenantId: user.tenantId, email: user.email },
          action: "LOGIN",
          entityType: "User",
          entityId: user.id,
          summary: "Signed in",
        });

        return { id: user.id, email: user.email };
      },
    }),
  ],
});
