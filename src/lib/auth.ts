import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "../db"
import { required } from "./env"

/**
 * Better Auth, configured for a closed archive.
 *
 * **Sign-up is disabled.** Nobody can create an account by visiting a page —
 * the first Owner is seeded, and everyone after that arrives by invitation
 * (ARCHITECTURE.md §10). This is the single most important line in the file:
 * the admin panel governs a published archive, and an open registration form
 * would be a way in.
 *
 * The session cookie cache keeps the proxy's session check cheap, since it runs
 * on every request into the admin area.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  // Asserted here rather than in the environment schema: this module is what
  // genuinely needs them, and every admin page and every mutation reaches it
  // through `requireSession`. A Trigger worker never does, and used to be
  // required to carry an auth secret in order to be indexed at all.
  secret: required("BETTER_AUTH_SECRET"),
  baseURL: required("BETTER_AUTH_URL"),

  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 10,
  },

  user: {
    additionalFields: {
      /** Owner ⊃ Admin ⊃ Editor. Never settable by the account itself. */
      role: { type: "string", input: false, defaultValue: "editor" },
      disabledAt: { type: "date", input: false, required: false },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
})

export type Session = typeof auth.$Infer.Session
