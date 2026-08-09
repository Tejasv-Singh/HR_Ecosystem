import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/config";

/**
 * Redirects anonymous traffic to /login. (Next 16 calls this the "proxy"
 * convention; it was `middleware` in earlier versions.)
 *
 * This is a convenience layer only — authorisation is enforced again in every
 * service call, see lib/permissions.
 */
export default NextAuth(authConfig).auth;

export const config = {
  // Page routes only.
  //
  // `api` is excluded because redirecting an API call to the login page is the
  // wrong answer for a programmatic caller — it turns a 401 into a 200 that
  // happens to contain HTML. Route handlers call `requireActor()` themselves and
  // return a real 401/403; see lib/api.ts.
  //
  // `_next` is excluded wholesale, not just `_next/static` and `_next/image`:
  // the dev HMR endpoint lives at `_next/webpack-hmr`, and routing it through
  // the auth redirect breaks the websocket handshake.
  matcher: ["/((?!api/|_next/|favicon.ico).*)"],
};
