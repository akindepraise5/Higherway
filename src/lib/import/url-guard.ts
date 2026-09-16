/**
 * Deciding whether a pasted link is safe to fetch.
 *
 * Importing by URL means the *server* makes a request to an address a person
 * typed. That is a server-side request forgery risk: without checks, a link
 * like `http://169.254.169.254/` or `http://10.0.0.5:6379/` turns this feature
 * into a way to reach things only the server can see. ARCHITECTURE.md §6 sets
 * the rules — refuse private addresses, cap the size, time out, and prove the
 * file is a PDF by its own header rather than its name.
 *
 * Pure by design (`src/lib` holds no network or environment access), which is
 * what makes the bypass cases testable.
 *
 * **This is necessary but not sufficient.** A hostname that looks public can
 * still resolve to a private address, whether by misconfiguration or by DNS
 * rebinding, and no purely syntactic check can see that. Whatever performs the
 * fetch must re-check the address it actually connected to.
 */

/** Generous enough for the largest file in the archive (13.6 MB), not for a bomb. */
export const MAX_IMPORT_BYTES = 64 * 1024 * 1024

export const IMPORT_TIMEOUT_MS = 30_000

export type UrlVerdict = { ok: true; url: URL } | { ok: false; reason: string }

/**
 * IPv4 written as something other than four decimal octets.
 *
 * `http://2130706433/` and `http://0x7f000001/` are both 127.0.0.1, and a check
 * that only understands dotted quads waves them through. Returns the address as
 * four octets, or null when the hostname is not a bare IPv4 literal.
 */
function ipv4Octets(hostname: string): number[] | null {
  const dotted = hostname.split(".")

  if (dotted.length === 4 && dotted.every((part) => /^\d{1,3}$/.test(part))) {
    const octets = dotted.map(Number)
    return octets.every((n) => n <= 255) ? octets : null
  }

  // A single number: hexadecimal, octal, or decimal — and the order matters.
  // Octal has to be tried before decimal, because "017700000001" is all digits:
  // read as decimal it is 17,700,000,001, which overflows a 32-bit address and
  // returns null, letting 127.0.0.1 straight through. The test caught it.
  let value: number | null = null
  if (/^0[xX][0-9a-fA-F]+$/.test(hostname)) value = Number.parseInt(hostname, 16)
  else if (/^0[0-7]+$/.test(hostname)) value = Number.parseInt(hostname, 8)
  else if (/^\d+$/.test(hostname)) value = Number(hostname)

  if (value === null || !Number.isInteger(value) || value < 0 || value > 0xffffffff) return null
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
}

/**
 * Addresses the server must never be told to fetch: itself, its own network,
 * and the cloud metadata endpoint that hands out credentials.
 */
export function isPrivateAddress(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "")
  if (host.length === 0) return true

  // Names that only ever mean "this machine" or "this network".
  if (host === "localhost" || host === "localhost.localdomain") return true
  if (/\.(localhost|local|internal|intranet|lan|home|corp)$/.test(host)) return true
  if (host === "metadata.google.internal") return true

  // IPv6 arrives from URL parsing wrapped in brackets.
  if (host.startsWith("[") && host.endsWith("]")) {
    const v6 = host.slice(1, -1)
    if (v6 === "::1" || v6 === "::" || v6 === "0:0:0:0:0:0:0:1") return true
    // Unique-local (fc00::/7) and link-local (fe80::/10).
    if (/^f[cd]/.test(v6) || /^fe[89ab]/.test(v6)) return true
    // ::ffff:127.0.0.1 — IPv4 wearing an IPv6 coat.
    const mapped = v6.match(/^::ffff:(.+)$/i)
    if (mapped?.[1]) return isPrivateAddress(mapped[1])
    return false
  }

  const octets = ipv4Octets(host)
  if (!octets) return false

  const [a, b] = octets as [number, number, number, number]
  if (a === 0) return true // 0.0.0.0/8, "this network"
  if (a === 10) return true // private
  if (a === 127) return true // loopback
  if (a === 169 && b === 254) return true // link-local, includes 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true // private
  if (a === 192 && b === 168) return true // private
  if (a === 100 && b >= 64 && b <= 127) return true // carrier-grade NAT
  if (a === 192 && b === 0) return true // 192.0.0.0/24, protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking
  if (a >= 224) return true // multicast and reserved

  return false
}

/** Whether a pasted link may be fetched at all. */
export function checkImportUrl(raw: string): UrlVerdict {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, reason: "That link is empty." }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { ok: false, reason: "That is not a valid link." }
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Only http and https links can be imported." }
  }

  // Credentials in a URL would be sent onward by the server, and they are a
  // common way to smuggle a different host past a careless check.
  if (url.username || url.password) {
    return { ok: false, reason: "Links with a username or password are not accepted." }
  }

  if (isPrivateAddress(url.hostname)) {
    return { ok: false, reason: "That address is on a private network." }
  }

  return { ok: true, url }
}

/**
 * A PDF, judged by its own first bytes.
 *
 * The name proves nothing: the backfill hit this when Google served an HTML
 * sign-in page for a link that was not really public, and storing that as a
 * PDF would have looked like a successful import.
 */
export function looksLikePdf(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false
  return String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-"
}
