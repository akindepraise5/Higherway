/**
 * Removing what an OCR engine invented, before it reaches the index.
 *
 * ARCHITECTURE.md §7 records the reason: tesseract "invents text from"
 * photographs embedded in a page, emitting runs of consonants and stray symbols
 * that are not words in any language. Left in, they are indexed, and a search
 * for a real phrase competes with them.
 *
 * **Conservative on purpose.** Deleting a real word is far worse than keeping an
 * invented one: a reader searching for a phrase gets nothing and concludes the
 * archive does not hold it, which is the bug this project has already shipped
 * once (a newline where a space was expected made every wrapped phrase
 * unfindable). Every rule here is allowed to miss junk; none may take a word.
 *
 * Pure by design (CLAUDE.md): no database, no network, no environment.
 */

/** `y` counts. Without it "why", "rhythm" and "myth" are junk. */
const VOWELS = /[aeiouy]/i
const HAS_LETTER = /[a-z]/i

/**
 * Tokens shorter than this are never touched.
 *
 * "I", "a", "in", "of", "to" and every page number have to survive, and a
 * two-letter run of consonants is as likely to be a real abbreviation as noise.
 */
const MIN_LENGTH = 3

/** Three or more of the same symbol: a rule, a torn edge, a scanner artefact. */
const SYMBOL_RUN = /^([^\w\s])\1{2,}$/

/**
 * Whether one token looks invented.
 *
 * All-uppercase is exempt outright. `KJV`, `NKJV`, `NLT` and `RSV` are the Bible
 * versions this archive cites constantly and not one of them has a vowel; so do
 * `LXX` and initials like `J.D.`. Losing those would be a visible wound in a
 * publication that quotes scripture on nearly every page.
 */
export function looksInvented(token: string): boolean {
  const bare = token.replace(/^[^\w]+|[^\w]+$/g, "")
  if (bare.length === 0) return SYMBOL_RUN.test(token)
  if (bare.length < MIN_LENGTH) return false
  if (!HAS_LETTER.test(bare)) return false
  if (bare === bare.toUpperCase()) return false
  return !VOWELS.test(bare)
}

/**
 * Strip invented tokens from a recognised page.
 *
 * Whitespace is preserved as it was, including the newlines that carry the line
 * structure `lib/text/columns` produced — a token is blanked in place rather
 * than the text being re-joined, because re-joining would collapse the lines and
 * the de-hyphenation that depends on them.
 */
export function stripInvented(text: string): string {
  return (
    text
      .split(/(\s+)/)
      .map((piece) => (/^\s+$/.test(piece) || !looksInvented(piece) ? piece : ""))
      .join("")
      // Blanking a token leaves the spaces that surrounded it back to back.
      .replace(/[^\S\n]{2,}/g, " ")
      .replace(/^[^\S\n]+|[^\S\n]+$/gm, "")
  )
}

/**
 * What share of a page survived the filter, 0–1.
 *
 * A page that loses most of itself is not a page that was cleaned, it is a
 * photograph the engine should never have been asked to read. Reporting it lets
 * the quality score say so rather than the text quietly going almost empty.
 */
export function survivingShare(before: string, after: string): number {
  const count = (s: string) => s.split(/\s+/).filter(Boolean).length
  const total = count(before)
  return total === 0 ? 1 : count(after) / total
}
