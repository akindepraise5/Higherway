import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "./auth"

/**
 * Reading the session, and refusing to continue without one.
 *
 * `src/proxy.ts` bounces signed-out visitors before a page renders, but that is
 * the fast first line and not the only one: every admin page and every mutation
 * checks for itself. A guard that exists in one place only is a guard that gets
 * bypassed by the next route someone adds.
 */

export type Role = "owner" | "admin" | "editor"

/** Owner ⊃ Admin ⊃ Editor. ARCHITECTURE.md §10. */
const RANK: Record<Role, number> = { editor: 1, admin: 2, owner: 3 }

export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

export async function requireSession() {
  const session = await getSession()
  if (!session) redirect("/sign-in")

  // A suspended account keeps its history but loses its way in.
  if ((session.user as { disabledAt?: Date | null }).disabledAt) redirect("/sign-in?disabled=1")

  return session
}

/**
 * Requires at least this role. Someone signed in but not senior enough is sent
 * to the admin home rather than to sign-in — they are not anonymous, they are
 * simply not allowed here, and bouncing them to a login form would be a lie.
 */
export async function requireRole(minimum: Role) {
  const session = await requireSession()
  const role = ((session.user as { role?: Role }).role ?? "editor") as Role

  if (RANK[role] < RANK[minimum]) redirect("/admin?denied=1")

  return { session, role }
}

/** For conditional rendering — hiding a control the viewer cannot use. */
export function hasRole(role: Role | undefined, minimum: Role): boolean {
  return RANK[role ?? "editor"] >= RANK[minimum]
}
