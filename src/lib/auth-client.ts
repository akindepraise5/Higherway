import { createAuthClient } from "better-auth/react"

/**
 * The browser half of Better Auth. Used only inside the admin area and on the
 * sign-in page — the public site never imports this, so none of it reaches a
 * reader.
 */
export const authClient = createAuthClient({
  /**
   * In the browser, talk to the origin we were actually served from rather
   * than a configured URL. A dev server that lands on a different port than
   * NEXT_PUBLIC_SITE_URL expects would otherwise post sign-in requests at a
   * dead address — which is exactly what happened, and cost an evening.
   */
  baseURL:
    typeof window === "undefined" ? process.env.NEXT_PUBLIC_SITE_URL : window.location.origin,
})

export const { signIn, signOut, useSession } = authClient
