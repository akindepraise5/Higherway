/**
 * The "same text" duplicate signal. ARCHITECTURE.md §8.
 *
 * Compares documents by overlapping runs of words (shingles) rather than by
 * exact string match, because the two copies we are trying to catch were
 * photographed separately: the same page read twice produces slightly
 * different text, with the odd word misread. Shingle overlap degrades
 * gracefully under that noise, where string equality fails outright.
 *
 * Pure by design (CLAUDE.md): no database, no network, no environment.
 */

/**
 * Three words. A single misread word destroys `SHINGLE_SIZE` shingles, so the
 * shorter the run, the less damage two OCR slips do.
 *
 * Measured on two real reads of one page from this archive ("to" read as "lo",
 * "built" as "buiIt"), against an unrelated material as a control:
 *
 *   size   same page twice   unrelated
 *   3          0.778           0.000
 *   4          0.722           0.000
 *   5          0.667           0.000
 *   6          0.611           0.000
 *
 * Three scores the true pair highest while the unrelated pair stays at zero,
 * so nothing is given up for the sensitivity.
 */
export const SHINGLE_SIZE = 3

/** Reduce text to comparable words: lowercase, no punctuation, no runs of space. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * The set of k-word runs in a text. A Set, not an array: repeated phrases
 * should not weight the comparison, and set overlap is what Jaccard wants.
 */
export function shingles(text: string, size: number = SHINGLE_SIZE): Set<string> {
  const w = words(text)
  const out = new Set<string>()

  // Text shorter than one shingle still needs to be comparable with itself.
  if (w.length === 0) return out
  if (w.length < size) {
    out.add(w.join(" "))
    return out
  }

  for (let i = 0; i <= w.length - size; i++) {
    out.add(w.slice(i, i + size).join(" "))
  }
  return out
}

/** Overlap of two sets, 0 to 1. Two empty sets are identical, not undefined. */
export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0

  // Iterate the smaller set — these are documents, not sentences.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  let shared = 0
  for (const item of small) if (large.has(item)) shared++

  return shared / (a.size + b.size - shared)
}

/**
 * How much of two documents' text is the same, 0 to 1. Plain Jaccard.
 *
 * Blending containment in here was tried and rejected on measurement. An
 * article reprinted inside a longer booklet scores containment 1.000 — by
 * definition, every one of its shingles is in the booklet — so mixing it in
 * lifted that case from 0.50 to 0.79 and collapsed the gap against a genuine
 * duplicate at 0.78. The two findings are different in kind, not degree, so
 * containment stays a separate signal in `dedupe/score`, where the review page
 * can say "this appears inside that" rather than "these are the same".
 */
export function textSimilarity(a: string, b: string, size: number = SHINGLE_SIZE): number {
  return jaccard(shingles(a, size), shingles(b, size))
}

/**
 * Containment rather than overlap: how much of the *shorter* text appears in
 * the longer one. A one-page article reprinted inside a twenty-page booklet
 * scores near 1 here but low on Jaccard, because the sizes are so different.
 */
export function containment(a: string, b: string, size: number = SHINGLE_SIZE): number {
  const sa = shingles(a, size)
  const sb = shingles(b, size)
  if (sa.size === 0 || sb.size === 0) return 0

  const [small, large] = sa.size <= sb.size ? [sa, sb] : [sb, sa]
  let shared = 0
  for (const item of small) if (large.has(item)) shared++

  return shared / small.size
}
