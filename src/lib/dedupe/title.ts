/**
 * Title normalisation, for the "similar title" duplicate signal.
 *
 * The archive arrives with 62 exact-title duplicate groups covering 132 rows,
 * and 69 once case and punctuation are ignored — so the gap between those two
 * numbers is exactly what this file has to close. Real pairs from the data:
 *
 *   "A Heart Like His"              vs "A heart like His"
 *   "A place of surrender"          vs "A Place of Surrender"
 *   "Are we ready for a revival"    vs "Are we ready for a Revival"
 *   "A new life for 'Presley' park" vs "A new life for Presley Park"
 *
 * A handful of titles are filenames rather than names:
 *   "2017-01-FTWord-The-Way-of-Holiness" → "the way of holiness"
 *
 * Pure by design (CLAUDE.md): no database, no network, no environment.
 */

/** Leading date-and-series filename prefixes, e.g. "2017-01-FTWord-". */
const FILENAME_PREFIX = /^\d{4}[-_]\d{2}[-_](?:[a-z]+[-_])?/i

/** Trailing copy markers: "(1)", "copy", "copy 2", "- Copy". */
const COPY_SUFFIX = /(?:[-–—\s]*\(?\bcopy\b\s*\d*\)?|\s*\(\d+\))\s*$/i

/** A leading "copy of ". */
const COPY_PREFIX = /^\s*copy\s+of\s+/i

const FILE_EXTENSION = /\.(?:pdf|docx?|jpe?g|png)$/i

/**
 * Words too common in this archive to carry meaning when comparing titles.
 * Deliberately short: over-stripping merges genuinely different materials.
 */
const NOISE = new Set(["the", "a", "an", "of", "for", "and", "to", "in", "on", "is"])

/**
 * A human-facing cleanup: what a filename-style title should look like once
 * it is a name again. Used to *suggest* a better title, never to overwrite
 * one silently.
 */
export function cleanTitle(raw: string): string {
  const stripped = raw
    .trim()
    .replace(FILE_EXTENSION, "")
    .replace(COPY_PREFIX, "")
    .replace(COPY_SUFFIX, "")
    .replace(FILENAME_PREFIX, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!stripped) return raw.trim()

  // Only re-case titles that arrived shouting or as a filename slug; a title
  // someone typed properly is left exactly as they wrote it.
  const looksLikeSlug = !raw.includes(" ") && /[-_]/.test(raw)
  const isShouting = stripped === stripped.toUpperCase() && /[A-Z]{4,}/.test(stripped)

  if (!looksLikeSlug && !isShouting) return stripped

  return stripped
    .toLowerCase()
    .split(" ")
    .map((word, i) =>
      i > 0 && NOISE.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ")
}

/**
 * The comparison key. Aggressive on purpose — case, punctuation, accents,
 * copy markers and filename prefixes all disappear, because two titles that
 * differ only in those ways are the same title.
 */
export function normaliseTitle(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(FILE_EXTENSION, "")
    .replace(COPY_PREFIX, "")
    .replace(COPY_SUFFIX, "")
    .replace(FILENAME_PREFIX, "")
    .replace(/['''`]/g, "") // don't let "Presley's" differ from "Presleys"
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

/** The normalised title as a word set, with the commonest words dropped. */
export function titleTokens(raw: string): Set<string> {
  const tokens = normaliseTitle(raw)
    .split(" ")
    .filter((t) => t.length > 0 && !NOISE.has(t))
  return new Set(tokens.length > 0 ? tokens : normaliseTitle(raw).split(" ").filter(Boolean))
}

/**
 * Similarity between two titles, 0 to 1.
 *
 * Identical once normalised scores 1. Otherwise it is the overlap of the
 * significant words (Jaccard), which handles reordering and small additions
 * without the false matches that character-level comparison produces on short
 * titles — "God cares" and "God calls" share most of their characters but
 * none of their meaning.
 */
export function titleSimilarity(a: string, b: string): number {
  const na = normaliseTitle(a)
  const nb = normaliseTitle(b)
  if (!na && !nb) return 1
  if (!na || !nb) return 0
  if (na === nb) return 1

  const ta = titleTokens(a)
  const tb = titleTokens(b)
  if (ta.size === 0 || tb.size === 0) return 0

  let shared = 0
  for (const token of ta) if (tb.has(token)) shared++

  return shared / (ta.size + tb.size - shared)
}
