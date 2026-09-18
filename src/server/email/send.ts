import { Resend } from "resend"
import { env, hasEmail } from "../../lib/env"

/**
 * Sending email, through Resend.
 *
 * `hasEmail` has been in `src/lib/env.ts` since Phase 1 with no reader — the
 * flag existed, `resend` was not even a dependency, and every invitation was
 * copied out by hand. This is its first caller.
 *
 * **Never throws.** An email that fails to send must not undo the thing it was
 * announcing: the invitation is already created, its token is already valid, and
 * the admin can still copy the link. Reporting `sent: false` with a reason lets
 * the panel say "created, but the email did not go" — which is the truth and is
 * actionable. Throwing would roll the caller back and destroy a perfectly good
 * invitation because a third party was briefly unreachable.
 */

export type SendResult = { sent: true; id: string } | { sent: false; why: string }

let client: Resend | null = null

function resend(): Resend {
  if (!client) client = new Resend(env.RESEND_API_KEY)
  return client
}

export async function sendEmail(input: {
  to: string
  subject: string
  html: string
  text: string
  /** Set on a transactional email so a reply reaches a person, not the void. */
  replyTo?: string
}): Promise<SendResult> {
  if (!hasEmail || !env.EMAIL_FROM) {
    return { sent: false, why: "RESEND_API_KEY and EMAIL_FROM are not both set" }
  }

  try {
    const { data, error } = await resend().emails.send({
      from: env.EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      // Both parts, always. A text alternative is what stops a plain-text
      // client showing nothing, and its absence is a real spam signal.
      text: input.text,
      replyTo: input.replyTo,
    })

    if (error) return { sent: false, why: error.message }
    if (!data?.id) return { sent: false, why: "Resend accepted it but returned no id" }
    return { sent: true, id: data.id }
  } catch (error) {
    return { sent: false, why: error instanceof Error ? error.message : "the request failed" }
  }
}
