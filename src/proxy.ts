import { type NextRequest, NextResponse } from "next/server"
import { auth } from "./lib/auth"
import { safeRedirect } from "./lib/redirect"

/**
 * Route guard (Next 16's `proxy` convention, runs before rendering).
 *
 * Signed-in staff are bounced off the sign-in page; signed-out visitors are
 * bounced off the admin area and sent back to where they were headed once they
 * have signed in.
 *
 * It performs a real Better Auth session check rather than asking "is there a
 * cookie". A stale or forged cookie would otherwise ping-pong someone between
 * /sign-in and /admin for ever. The session cookie cache keeps that cheap.
 *
 * This is the fast first line, not the only one — every admin page and every
 * mutation calls requireSession/requireRole for itself (lib/session.ts).
 *
 * The public archive is deliberately not matched: readers never authenticate,
 * and nothing about browsing should touch this.
 */

const AUTH_PAGES = new Set(["/sign-in"])

export async function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null)

  if (AUTH_PAGES.has(pathname)) {
    if (!session) return NextResponse.next()
    const target = safeRedirect(searchParams.get("redirectTo")) ?? "/admin"
    return NextResponse.redirect(new URL(target, request.url))
  }

  // Everything else matched is the admin area.
  if (session) return NextResponse.next()

  const signIn = new URL("/sign-in", request.url)
  signIn.searchParams.set("redirectTo", `${pathname}${search}`)
  return NextResponse.redirect(signIn)
}

export const config = {
  matcher: ["/admin/:path*", "/sign-in"],
}
