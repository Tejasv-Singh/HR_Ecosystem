import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe slice of the Auth.js configuration.
 *
 * `middleware.ts` runs on the edge runtime, where Prisma and the `pg` driver
 * cannot load. This config therefore contains no providers and no database
 * access — just cookie/JWT handling and the route guard. The full config in
 * `./index.ts` extends it with the Credentials provider.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8, // an eight-hour working day
  },
  callbacks: {
    /**
     * Coarse gate used by middleware. This is a redirect helper, not the
     * security boundary — every service call re-checks permissions server-side.
     */
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const { pathname } = request.nextUrl;

      const isPublic =
        pathname === "/" ||
        pathname.startsWith("/login") ||
        pathname.startsWith("/signup") ||
        pathname.startsWith("/invite") ||
        pathname.startsWith("/forgot-password") ||
        pathname.startsWith("/reset-password");

      return isPublic || isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
