/**
 * Putting back together words the printer broke across a line.
 *
 * A column of justified type is full of these: "admis-" / "sion", "sur-" /
 * "prise", "scholar-" / "ship". Left split, the word is not merely ugly — it
 * cannot be searched for, which defeats the reason the text is public at all
 * (ARCHITECTURE.md §7).
 *
 * This lives apart from `columns.ts` because it is needed by text that never
 * goes near column geometry. A PDF carrying its own text layer has that text
 * lifted straight out by `extractText`, bypassing `readingOrder` entirely — so
 * while de-hyphenation was welded inside that function, 32 pages of this
 * archive kept their broken words permanently and no amount of re-reading
 * would have fixed them.
 *
 * Pure, so both paths can be tested without an image or a Mac.
 */

/**
 * Prefixes that keep their hyphen when a word breaks across a line.
 *
 * Deliberately almost empty. An earlier version listed "re", "pre", "co" and
 * "ex" alongside these, which reads sensibly and is badly wrong: "re-" /
 * "ceived", "pre-" / "sented", "co-" / "ming" and "ex-" / "ample" are ordinary
 * line breaks, and keeping their hyphens would corrupt far more words than the
 * list ever rescued. The archive quotes 1 Thessalonians 5:23 as "“pre-" /
 * "served”", and the word is "preserved".
 *
 * "self-" survives because this archive really does carry "Self denial" as a
 * title, and because no common word begins "self" without one. The heavy
 * lifting is done by the structural checks below, which need no vocabulary.
 */
const KEEPS_HYPHEN = new Set(["self", "anti", "cross"])

/**
 * Whether the hyphen belongs to the word rather than to the typesetter.
 *
 * Checked against every such break in the archive's embedded text: of 94, a
 * dozen were real hyphens that removing would have corrupted. They fall into
 * three shapes, and all three are structural rather than vocabulary — a list of
 * words would have caught "one-" and missed "215-million-".
 *
 *   one-third, four-part, two-handed      a number word or a digit
 *   .../gay-marriage-/around-the-world    a wrapped URL
 *   down-to-earth, w-h-o-l-l-y            a chain that is already hyphenated
 */
function hyphenIsPartOfTheWord(stem: string): boolean {
  const lastWord = stem.split(/\s+/).pop() ?? ""
  const lower = lastWord.toLowerCase()

  if (KEEPS_HYPHEN.has(lower)) return true
  // A URL, or a path — its hyphens are address, not hyphenation.
  if (/[/:]/.test(lastWord) || /\.[a-z]{2,}$/i.test(lastWord)) return true
  // Already part of a hyphenated chain: "down-to-", "up-out-in-".
  if (lastWord.includes("-")) return true
  if (/\d/.test(lastWord)) return true
  return NUMBER_WORDS.has(lower)
}

/** Enough to cover compounds; digits are caught separately. */
const NUMBER_WORDS = new Set([
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
  "hundred",
  "thousand",
])

/**
 * Rejoin split words across a list of lines.
 *
 * Only joins when the next line starts lower-case. That guard matters more than
 * it looks: the last line of a column often ends mid-word with the article
 * continuing overleaf, and what follows it is not the rest of the word but the
 * folio line — "18 Higher Way", "Scanned by CamScanner". Splicing "that op-"
 * onto a page number would be worse than leaving the word broken.
 */
export function joinHyphenatedLines(lines: string[]): string[] {
  const out: string[] = []

  for (const line of lines) {
    const previous = out[out.length - 1]

    if (previous !== undefined && /\w[-–]$/.test(previous) && /^[a-z]/.test(line)) {
      const stem = previous.slice(0, -1)
      out[out.length - 1] = hyphenIsPartOfTheWord(stem) ? `${stem}-${line}` : stem + line
      continue
    }

    out.push(line)
  }

  return out
}

/** The same, for text that already exists as one string. */
export function dehyphenate(text: string): string {
  return joinHyphenatedLines(text.split("\n")).join("\n")
}
