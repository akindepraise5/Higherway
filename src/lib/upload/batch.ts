/**
 * The pure parts of adding several materials at once.
 *
 * Pure so that the queue's rules can be tested without a browser, a bucket or a
 * session — CLAUDE.md keeps `src/lib/` free of all three. The service and the
 * form both read from here, which is the point: `MAX_BATCH` has to mean the same
 * number on the button that disables itself and in the call that refuses.
 */

/**
 * The most files one press of the button may queue.
 *
 * Generous enough for the way this archive actually arrives — a folder of forty
 * or fifty scans at a time — and bounded, because every queued file is a signed
 * URL that stays valid whether or not anything is ever PUT to it.
 */
export const MAX_BATCH = 60

/**
 * The most a **public submission** may carry.
 *
 * Far fewer than an admin's 60, and the difference is not arbitrary: an editor
 * batching fifty scans is a known person doing a known job, and a stranger is
 * not. Ten is enough for anyone sending in what they have.
 *
 * Here rather than beside the service for the same reason as `MAX_BATCH`: a
 * `"use server"` module may only export async functions, and the form needs the
 * same number to know when to stop accepting files.
 */
export const MAX_SUBMISSION = 10

/**
 * How many files go up at once.
 *
 * Three, not fifty. The bytes go browser → R2 directly, so the limit being
 * respected here is the uploader's own connection: fifty parallel PUTs over a
 * phone's uplink finish no sooner in total and make every single one of them
 * look stalled, which is the state people cancel out of.
 */
export const UPLOAD_CONCURRENCY = 3

/**
 * A first guess at a title, from the name of the file.
 *
 * Most of this archive's titles began life exactly this way — the v1 import
 * turned `2018-07-Classics-The-Essence-of-True-Christianity` into "The Essence
 * of True Christianity" — so it is a good enough default that a batch of fifty
 * never has to be typed out by hand. It is a guess, and every row stays
 * editable.
 *
 * It deliberately does **not** strip leading dates or section words. That was
 * the sheet import's job, where the pattern was known and consistent; guessing
 * at it here would quietly eat the beginning of a title like "1999 and beyond".
 */
export function titleFromFilename(name: string): string {
  return (
    name
      .replace(/\.pdf$/i, "")
      // Separators a file system uses where a person would have used a space.
      .replace(/[-_]+/g, " ")
      // A downloaded copy often arrives as "thing (1).pdf".
      .replace(/\s*\(\d+\)\s*$/, "")
      .replace(/\s+/g, " ")
      .trim()
  )
}

/** Whether a row is ready to be sent. The form greys out the button on this. */
export function titleIsUsable(title: string): boolean {
  return title.trim().length >= 2
}

/**
 * The name at the end of a URL, for the same purpose.
 *
 * Kept beside `titleFromFilename` because they are the same guess made about
 * the same thing, and were written twice with slightly different rules before
 * this existed. A URL with no usable last segment gives an empty string, which
 * `titleIsUsable` then rejects — the caller asks the person instead of inventing
 * something.
 */
export function titleFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? ""
    return titleFromFilename(decodeURIComponent(last))
  } catch {
    return ""
  }
}
