import { env } from "../lib/env"

/**
 * Checking a Cloudflare Turnstile token, server-side.
 *
 * The widget in the browser produces a token; **only this call decides whether
 * it means anything**. A token that is merely present proves nothing — it is a
 * string in a form post, and a script posting to the same endpoint can send any
 * string it likes. Everything that follows a submission hangs on the answer
 * here, so it is the first thing done and the only thing trusted.
 *
 * Tokens are **single use**, which is the property doing most of the work: it
 * bounds one solved challenge to one submission, so a bot that gets past the
 * widget once cannot replay that success across a thousand uploads.
 *
 * No dependency: it is one POST to `siteverify`.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
const TIMEOUT_MS = 10_000

export type Verdict = { ok: true } | { ok: false; why: string }

export async function verifyTurnstile(token: string, ip?: string): Promise<Verdict> {
  if (!env.TURNSTILE_SECRET_KEY) {
    // Refusing, not passing. A missing secret must never mean "let everyone
    // through" — that is the failure mode where an environment variable gets
    // dropped in a deploy and the bucket is open until somebody notices.
    return { ok: false, why: "Submissions are not configured." }
  }
  if (!token || token.length > 2048) {
    return { ok: false, why: "That check did not complete. Try again." }
  }

  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token })
  if (ip) body.set("remoteip", ip)

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    const json = (await response.json()) as { success?: boolean; "error-codes"?: string[] }
    if (json.success) return { ok: true }

    const codes = json["error-codes"] ?? []
    return {
      ok: false,
      // Said plainly, because a real person hitting a stale tab should be told
      // to try again rather than shown a Cloudflare error code.
      why: codes.includes("timeout-or-duplicate")
        ? "That check has already been used. Reload the page and try again."
        : "That check did not pass. Reload the page and try again.",
    }
  } catch {
    // A verifier that cannot be reached means the submission is refused, not
    // waved through. Same reason as the missing secret above.
    return { ok: false, why: "The check could not be completed just now. Try again shortly." }
  }
}
