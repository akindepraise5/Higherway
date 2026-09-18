/**
 * The invitation email, as text.
 *
 * Pure by design (CLAUDE.md): it takes a name, a link and an expiry and returns
 * a subject, an HTML body and a plain-text body. No client, no environment, no
 * network — those are `server/email`. So the wording, the escaping and the
 * expiry arithmetic are all testable without an API key.
 *
 * **Hand-written HTML rather than React Email**, which ARCHITECTURE.md §3 names.
 * The recorded reason for that choice was templating several emails; there is
 * exactly one, and `@react-email/components` is a substantial dependency to
 * carry for sixty lines of table markup. If a second and third email arrive,
 * revisit it — that is when the library starts paying for itself.
 *
 * The layout is deliberately plain: a table, inline styles, no external CSS and
 * no images. Every mail client strips or mangles something different, and an
 * invitation that renders as a blank rectangle in Outlook is worse than an
 * invitation that looks slightly plain everywhere.
 */

export type Invite = {
  /** Where the link goes. Absolute — an email has no origin to be relative to. */
  link: string
  /** Who sent it, for "X has invited you". Their email if they have no name. */
  from: string
  /** What they will be able to do. Shown, because it sets expectations. */
  role: string
  hours: number
}

/** Anything interpolated into HTML is escaped here, including the link. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

const ROLE_SAYS: Record<string, string> = {
  owner: "You will be an Owner, so you can do everything, including managing topics and people.",
  admin: "You will be an Admin, so you can publish and archive materials as well as edit them.",
  editor: "You will be an Editor, so you can add materials, correct their details and file them.",
}

export function inviteEmail(invite: Invite): { subject: string; html: string; text: string } {
  const { link, from, role, hours } = invite
  const says = ROLE_SAYS[role] ?? ROLE_SAYS.editor
  const expiry = hours === 1 ? "1 hour" : `${hours} hours`

  const subject = "You have been invited to help with the Higherway archive"

  /**
   * The link appears twice on purpose: as a button, and as text underneath.
   * A client that blocks the styled anchor still shows something copyable, and
   * someone who wants to check where a link goes before pressing it can.
   */
  const text = [
    `${from} has invited you to help look after the Higherway archive.`,
    "",
    says,
    "",
    "Set your password and sign in here:",
    link,
    "",
    `This link works once and expires in ${expiry}. If it has expired, ask for another.`,
    "",
    "If you were not expecting this, you can ignore it — nothing happens until you use the link.",
  ].join("\n")

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f5f1ea;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#141a17;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0 auto;background:#fbf8f3;border:1px solid #e6dfd3;border-radius:4px;">
      <tr>
        <td style="padding:28px 28px 0;">
          <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8a8177;">Higherway</div>
          <h1 style="margin:14px 0 0;font-size:22px;font-weight:400;line-height:1.3;">
            ${esc(from)} has invited you to help with the archive
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 28px 0;font-size:15px;line-height:1.6;color:#3b443e;">
          <p style="margin:0 0 14px;">${esc(says)}</p>
          <p style="margin:0;">Set a password to get started.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:22px 28px 0;">
          <a href="${esc(link)}" style="display:inline-block;background:#141a17;color:#fbf8f3;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:500;">
            Set your password
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:18px 28px 28px;font-size:12.5px;line-height:1.6;color:#8a8177;">
          <p style="margin:0 0 10px;">
            This link works once and expires in ${esc(expiry)}. If it has expired, ask for another.
          </p>
          <p style="margin:0 0 10px;word-break:break-all;">
            Or paste this into your browser:<br /><span style="color:#6e756e;">${esc(link)}</span>
          </p>
          <p style="margin:0;">
            If you were not expecting this, you can ignore it — nothing happens until you use the link.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, html, text }
}
