import { describe, expect, it } from "vitest"
import { classifyInvitation, type InviteState } from "./invite-token"

const NOW = new Date("2026-09-16T19:30:00.000Z")
const HOUR = 60 * 60 * 1000

const live = (overrides: Partial<InviteState> = {}): InviteState => ({
  acceptedAt: null,
  revokedAt: null,
  expiresAt: new Date(NOW.getTime() + 72 * HOUR),
  ...overrides,
})

describe("classifyInvitation", () => {
  it("accepts a link that is unused, unrevoked and in date", () => {
    expect(classifyInvitation(live(), NOW)).toBeNull()
  })

  it("says not_found when no invitation matches the token", () => {
    expect(classifyInvitation(null, NOW)).toBe("not_found")
    expect(classifyInvitation(undefined, NOW)).toBe("not_found")
  })

  it("says accepted for a link that has already been used", () => {
    expect(classifyInvitation(live({ acceptedAt: NOW }), NOW)).toBe("accepted")
  })

  it("says expired for a link past its 72 hours", () => {
    expect(classifyInvitation(live({ expiresAt: new Date(NOW.getTime() - HOUR) }), NOW)).toBe(
      "expired",
    )
  })

  /**
   * The bug this function exists to fix. Sending someone a new link requires
   * revoking the old one, so an earlier link is withdrawn while still well
   * inside its 72 hours. The page used to call that "expired" — true of none of
   * it — and nobody could tell from the screen what had actually happened.
   */
  it("says revoked, not expired, for a withdrawn link still inside its 72 hours", () => {
    const withdrawn = live({ revokedAt: new Date(NOW.getTime() - 5 * 60 * 1000) })
    expect(classifyInvitation(withdrawn, NOW)).toBe("revoked")
    expect(classifyInvitation(withdrawn, NOW)).not.toBe("expired")
  })

  it("prefers revoked over expired, because withdrawn is the truer reason", () => {
    const both = live({ revokedAt: NOW, expiresAt: new Date(NOW.getTime() - HOUR) })
    expect(classifyInvitation(both, NOW)).toBe("revoked")
  })

  it("prefers accepted over revoked, since 'sign in instead' is what they need", () => {
    expect(classifyInvitation(live({ acceptedAt: NOW, revokedAt: NOW }), NOW)).toBe("accepted")
  })

  describe("the edge of expiry", () => {
    it("is gone at the exact moment it expires", () => {
      expect(classifyInvitation(live({ expiresAt: NOW }), NOW)).toBe("expired")
    })

    it("still works one millisecond before", () => {
      expect(classifyInvitation(live({ expiresAt: new Date(NOW.getTime() + 1) }), NOW)).toBeNull()
    })
  })
})
