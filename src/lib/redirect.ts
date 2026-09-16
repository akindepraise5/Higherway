/**
 * Validates a post-sign-in `redirectTo` target.
 *
 * Same-site paths only. Without this, `?redirectTo=https://evil.com` turns the
 * sign-in page into an open redirect — a link that looks like ours, carries our
 * domain, and lands somebody somewhere else entirely.
 *
 * `//evil.com` is the one people forget: browsers read it as protocol-relative
 * and go off-site, even though it starts with a slash.
 *
 * Pure by design (CLAUDE.md).
 */
export function safeRedirect(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith("/")) return null
  if (value.startsWith("//")) return null
  if (value.startsWith("/\\")) return null
  return value
}
