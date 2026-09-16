/**
 * Normalising the titles the archive inherited.
 *
 * v1's titles came from three places and agree with none of the others:
 * filenames ("The-Essence-Of-True-Christianity"), spreadsheet cells typed by
 * different people ("THE TRIAL OF OUR FAITH"), and a few written properly. On a
 * shelf of cards that reads as noise.
 *
 * The house style is Title Case — every word's first letter capitalised,
 * including the short ones: "Time To Take Another Step", not "Time to take
 * another step".
 *
 * That choice is what makes this safe. Sentence case would mean *lowering*
 * words, and no amount of code can tell a proper noun from an ordinary word —
 * "1st Corinthians 13" would become "1st corinthians 13", turning a title that
 * is currently right into one that is visibly wrong. Raising a word can never
 * do that: the worst case is a word that was already capitalised staying so.
 *
 * Pure, so it is tested without a database, and applied at the point of display
 * — the stored title is never rewritten. A title records what the publication
 * called something, and a display convention is not reason enough to edit 624
 * rows.
 */

/**
 * Said as letters, not as a word, so they stay upper throughout.
 *
 * Only consulted when the source is SHOUTING, where every word looks alike and
 * nothing can be inferred from shape. In a normally-written title an
 * all-capital word is left as it was found, so this list never has to be
 * complete — a missing entry costs "Kjv", not a wrong name.
 */
const ABBREVIATIONS = new Set([
  "KJV",
  "NIV",
  "NKJV",
  "ESV",
  "NLT",
  "NASB",
  "RSV",
  "ASV",
  "AMP",
  "MSG",
  "TV",
  "DVD",
  "CD",
  "PDF",
  "UK",
  "USA",
  "OT",
  "NT",
  // Roman numerals — "Vol II", not "Vol Ii".
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
])

const letters = (word: string) => word.replace(/[^\p{L}]/gu, "")

/** Capitalises the first letter, reaching past any opening punctuation. */
function raiseFirst(word: string): string {
  const at = word.search(/\p{L}/u)
  if (at === -1) return word
  return word.slice(0, at) + word.charAt(at).toUpperCase() + word.slice(at + 1).toLowerCase()
}

function normaliseWord(word: string, shouted: boolean): string {
  // Nothing to capitalise: "13", "—", "&".
  if (!/\p{L}/u.test(word)) return word

  // Digits carry their own shape: "1st" must not become "1St", and "2Timothy"
  // is somebody's typing, not ours to reinterpret.
  if (/\d/.test(word)) return word

  // Capitals the writer meant, in the middle of a word: McKenzie, O'Brien.
  if (/\p{Ll}\p{Lu}/u.test(word)) return word

  const bare = letters(word)

  if (ABBREVIATIONS.has(bare.toUpperCase())) {
    return word.replace(/\p{L}+/gu, (run) => run.toUpperCase())
  }

  /**
   * An all-capital word inside a normally-written title is an abbreviation the
   * writer intended — "Reading the KJV". Left exactly as found.
   *
   * When the *whole* title is shouting this cannot be inferred, because "THE"
   * looks no different from "KJV", so it falls through to ordinary casing and
   * only the list above rescues a genuine abbreviation.
   */
  if (!shouted && bare.length > 1 && bare === bare.toUpperCase()) return word

  return raiseFirst(word)
}

/**
 * Title Case: every word's first letter raised, the rest lowered.
 *
 *   "THE TRIAL OF OUR FAITH"     → "The Trial Of Our Faith"
 *   "the cord of salvation"      → "The Cord Of Salvation"
 *   "Time To Take Another Step"  → unchanged
 *   "Reading the KJV"            → "Reading The KJV"
 */
export function titleCase(title: string): string {
  const trimmed = title.trim()
  if (!trimmed) return trimmed

  // Whether the source carries any case information at all. A title with no
  // lowercase letter anywhere is being shouted, and its capitals mean nothing.
  const shouted = !/\p{Ll}/u.test(trimmed)

  // Split on whitespace but keep it, so a title's own spacing survives.
  return trimmed
    .split(/(\s+)/)
    .map((part) => (/^\s+$/.test(part) ? part : normaliseWord(part, shouted)))
    .join("")
}
