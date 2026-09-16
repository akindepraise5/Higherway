import { describe, expect, it } from "vitest"
import { checkImportUrl, isPrivateAddress, looksLikePdf } from "./url-guard"

const rejected = (raw: string) => {
  const verdict = checkImportUrl(raw)
  return verdict.ok ? null : verdict.reason
}

describe("checkImportUrl", () => {
  it("accepts an ordinary https link", () => {
    const verdict = checkImportUrl("https://example.com/a-material.pdf")
    expect(verdict.ok).toBe(true)
  })

  it("refuses schemes that are not http or https", () => {
    expect(rejected("file:///etc/passwd")).toMatch(/http/)
    expect(rejected("ftp://example.com/x.pdf")).toMatch(/http/)
    // A data: URL would let someone hand the server bytes directly.
    expect(rejected("data:application/pdf;base64,JVBERi0=")).toMatch(/http/)
  })

  it("refuses credentials embedded in the link", () => {
    expect(rejected("https://user:secret@example.com/x.pdf")).toMatch(/username or password/)
  })

  it("refuses anything that is not a link at all", () => {
    expect(rejected("not a url")).toBeTruthy()
    expect(rejected("   ")).toBeTruthy()
  })
})

describe("isPrivateAddress", () => {
  it("catches the obvious local names", () => {
    for (const host of ["localhost", "LOCALHOST", "foo.local", "db.internal", "thing.lan"]) {
      expect(isPrivateAddress(host)).toBe(true)
    }
  })

  it("catches private and loopback IPv4", () => {
    for (const host of [
      "127.0.0.1",
      "10.0.0.5",
      "192.168.1.1",
      "172.16.0.1",
      "172.31.255.255",
      "100.64.0.1",
      "0.0.0.0",
    ]) {
      expect(isPrivateAddress(host)).toBe(true)
    }
  })

  it("catches the cloud metadata endpoint", () => {
    // This one hands out credentials, so it is the address that matters most.
    expect(isPrivateAddress("169.254.169.254")).toBe(true)
    expect(isPrivateAddress("metadata.google.internal")).toBe(true)
  })

  it("catches IPv4 written to dodge a dotted-quad check", () => {
    // All of these are 127.0.0.1.
    expect(isPrivateAddress("2130706433")).toBe(true)
    expect(isPrivateAddress("0x7f000001")).toBe(true)
    expect(isPrivateAddress("017700000001")).toBe(true)
  })

  it("catches IPv6 loopback, unique-local and link-local", () => {
    for (const host of ["[::1]", "[::]", "[fc00::1]", "[fd12:3456::1]", "[fe80::1]"]) {
      expect(isPrivateAddress(host)).toBe(true)
    }
  })

  it("catches IPv4 mapped into IPv6", () => {
    expect(isPrivateAddress("[::ffff:127.0.0.1]")).toBe(true)
  })

  it("lets ordinary public addresses through", () => {
    for (const host of ["example.com", "8.8.8.8", "drive.google.com", "172.32.0.1", "11.0.0.1"]) {
      expect(isPrivateAddress(host)).toBe(false)
    }
  })

  it("refuses private addresses through the full check", () => {
    expect(rejected("http://169.254.169.254/latest/meta-data/")).toMatch(/private network/)
    expect(rejected("http://2130706433:6379/")).toMatch(/private network/)
  })
})

describe("looksLikePdf", () => {
  const bytesOf = (s: string) => new TextEncoder().encode(s)

  it("accepts a real PDF header", () => {
    expect(looksLikePdf(bytesOf("%PDF-1.7\n..."))).toBe(true)
  })

  it("rejects the HTML page a sign-in wall returns", () => {
    // Exactly what Drive served for links that were not really public.
    expect(looksLikePdf(bytesOf("<!DOCTYPE html><html>"))).toBe(false)
  })

  it("rejects something too short to tell", () => {
    expect(looksLikePdf(bytesOf("%PD"))).toBe(false)
    expect(looksLikePdf(new Uint8Array())).toBe(false)
  })
})
