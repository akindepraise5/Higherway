import { createAuthClient } from "better-auth/react"

/**
 * The browser half of Better Auth. Used only inside the admin area and on the
 * sign-in page — the public site never imports this, so none of it reaches a
 * reader.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SITE_URL,
})

export const { signIn, signOut, useSession } = authClient
