import { describe, expect, it } from "vitest"
import { inviteEmail } from "./invite"

const base = {
  link: "https://higherway.example/invite/abc123",
  from: "Nathan",
  role: "editor",
  hours: 72,
}

describe("inviteEmail", () => {
  it("names the person who invited them, in both bodies", () => {
    const mail = inviteEmail(base)
    expect(mail.html).toContain("Nathan")
    expect(mail.text).toContain("Nathan")
  })

  it("carries the link in the button and as copyable text", () => {
    // A client that blocks the styled anchor must still show something usable.
    const mail = inviteEmail(base)
    expect(mail.html.match(/abc123/g)?.length).toBeGreaterThanOrEqual(2)
    expect(mail.text).toContain(base.link)
  })

  it("says what the role will let them do, per role", () => {
    expect(inviteEmail({ ...base, role: "owner" }).text).toContain("Owner")
    expect(inviteEmail({ ...base, role: "admin" }).text).toContain("Admin")
    expect(inviteEmail({ ...base, role: "editor" }).text).toContain("Editor")
  })

  it("falls back to the editor wording for a role it does not know", () => {
    // Better a true statement about the smallest role than a broken sentence.
    expect(inviteEmail({ ...base, role: "wizard" }).text).toContain("Editor")
  })

  it("says the expiry in hours, and gets the singular right", () => {
    expect(inviteEmail(base).text).toContain("72 hours")
    expect(inviteEmail({ ...base, hours: 1 }).text).toContain("1 hour")
    expect(inviteEmail({ ...base, hours: 1 }).text).not.toContain("1 hours")
  })

  it("escapes a name that contains markup", () => {
    // A display name comes from a user record, so it is not trusted here.
    const mail = inviteEmail({ ...base, from: '<script>alert("x")</script>' })
    expect(mail.html).not.toContain("<script>")
    expect(mail.html).toContain("&lt;script&gt;")
  })

  it("escapes the link's query separators rather than breaking the attribute", () => {
    const mail = inviteEmail({ ...base, link: "https://x.test/i/a?b=1&c=2" })
    expect(mail.html).toContain("a?b=1&amp;c=2")
    // The unescaped form must still be what a person can copy and paste.
    expect(mail.text).toContain("a?b=1&c=2")
  })

  it("tells someone who did not expect it that they can ignore it", () => {
    expect(inviteEmail(base).text).toContain("ignore it")
    expect(inviteEmail(base).html).toContain("ignore it")
  })
})
