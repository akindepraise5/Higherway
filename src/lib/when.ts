/**
 * Dates as a person reads them.
 *
 * Admin tables want "3 days ago" — the useful question there is how stale a
 * row is, not its exact timestamp. The exact timestamp goes in a `title`
 * attribute, so hovering still answers precisely.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function timeAgo(date: Date, now: Date = new Date()): string {
  const ms = now.getTime() - date.getTime()
  if (ms < 0) return "just now"
  if (ms < MINUTE) return "just now"
  if (ms < HOUR) {
    const n = Math.floor(ms / MINUTE)
    return `${n} min${n === 1 ? "" : "s"} ago`
  }
  if (ms < DAY) {
    const n = Math.floor(ms / HOUR)
    return `${n} hour${n === 1 ? "" : "s"} ago`
  }
  if (ms < 30 * DAY) {
    const n = Math.floor(ms / DAY)
    return n === 1 ? "yesterday" : `${n} days ago`
  }
  // Past a month, a date is more informative than "2 months ago".
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

/** The full stamp, for a tooltip. */
export const exact = (date: Date) =>
  date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })

/** A person's display name, falling back to the part of their email before the @. */
export const who = (name: string | null, email: string | null) =>
  name?.trim() || email?.split("@")[0] || "unknown"
