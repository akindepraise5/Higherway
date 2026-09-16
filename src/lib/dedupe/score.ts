import { titleSimilarity } from "./title"

/**
 * Combining the duplicate signals into one verdict. ARCHITECTURE.md §8.
 *
 * The system never deletes. It raises a pair, explains why, and a human
 * decides — so the job here is to be *legible*, not clever. Every result
 * carries the reasons that produced it, and the review page reads those out
 * instead of showing a number.
 *
 * Pure by design (CLAUDE.md): no database, no network, no environment.
 */

export type DuplicateSignals = {
  /** Byte-identical file. Decisive on its own. */
  sha256Equal?: boolean
  /** Same file already in Drive, by Drive's own checksum. Also decisive. */
  driveMd5Equal?: boolean
  /** Title similarity, 0-1. */
  title?: number
  /** Overlap of word-run shingles of the OCR text, 0-1. Tolerates OCR noise. */
  shingles?: number
  /**
   * How much of the shorter text appears in the longer one, 0-1. Distinct
   * from `shingles`: a one-page article reprinted inside a booklet scores 1
   * here and only ~0.5 there. Reported as its own finding, never merged in.
   */
  containment?: number
  /** Cosine similarity of the document embeddings, 0-1. */
  embedding?: number
  /** Same number of pages — weak on its own, useful as corroboration. */
  samePageCount?: boolean
}

export type Verdict = {
  /** 0-1. Above BLOCK it is certainly the same file; above FLAG, worth review. */
  score: number
  /** "identical" blocks an upload outright; "likely" and "possible" go to review. */
  level: "identical" | "likely" | "possible" | "distinct"
  /** Plain sentences, in the order they should be shown. */
  reasons: string[]
}

/**
 * Thresholds, recorded in ARCHITECTURE.md §8. These decide how noisy the
 * review page is, and are meant to be tuned against the real archive rather
 * than argued about in the abstract.
 */
export const THRESHOLD = {
  title: 0.55,
  /**
   * 0.7, not 0.8. Measured on two OCR reads of one page from this archive:
   * the true pair scores 0.778 while an unrelated material scores 0.000.
   * A threshold of 0.8 would have missed the very case this signal exists
   * for — short passages lose a fixed number of shingles per misread word.
   */
  shingles: 0.7,
  embedding: 0.93,
  /** One text almost wholly inside the other. A reprint, not necessarily a copy. */
  containment: 0.9,
  /** At or above this, a pair is worth a human's attention. */
  flag: 0.5,
} as const

export function scoreDuplicate(signals: DuplicateSignals): Verdict {
  const reasons: string[] = []

  // An identical file is not a judgement call.
  if (signals.sha256Equal) {
    return {
      score: 1,
      level: "identical",
      reasons: ["The file is byte-for-byte identical to one already here."],
    }
  }
  if (signals.driveMd5Equal) {
    return {
      score: 1,
      level: "identical",
      reasons: ["Google Drive reports this as the same file, by checksum."],
    }
  }

  const title = signals.title ?? 0
  const shingles = signals.shingles ?? 0
  const embedding = signals.embedding ?? 0

  // Content evidence outweighs the title: a re-scan under a new name is still
  // a duplicate, while two materials may legitimately share a title.
  let score = Math.max(
    shingles >= THRESHOLD.shingles ? shingles : shingles * 0.6,
    embedding >= THRESHOLD.embedding ? embedding * 0.95 : embedding * 0.5,
    title >= THRESHOLD.title ? title * 0.8 : title * 0.35,
  )

  if (title >= THRESHOLD.title) {
    reasons.push(
      title === 1
        ? "The titles match exactly, ignoring case and punctuation."
        : `The titles are ${pct(title)} alike.`,
    )
  }
  if (shingles >= THRESHOLD.shingles) {
    reasons.push(`The text is ${pct(shingles)} the same — likely the same material re-scanned.`)
  }
  if (embedding >= THRESHOLD.embedding) {
    reasons.push(`The two read as ${pct(embedding)} alike in meaning.`)
  }

  // Corroboration: two weak signals together are stronger than either alone.
  const corroborating = [
    title >= THRESHOLD.title,
    shingles >= THRESHOLD.shingles,
    embedding >= THRESHOLD.embedding,
  ].filter(Boolean).length

  if (corroborating >= 2) score = Math.min(1, score + 0.1)

  if (signals.samePageCount && corroborating >= 1) {
    score = Math.min(1, score + 0.03)
    reasons.push("Both have the same number of pages.")
  }

  /**
   * Containment is a finding in its own right, never folded into the score
   * above. An article reprinted inside a booklet contains every one of the
   * article's shingles, so blending it in would rate that pair as highly as a
   * genuine duplicate — measured at 0.79 against a true duplicate's 0.78,
   * which is no separation at all. Reported separately, a human can see the
   * difference between "the same material twice" and "this is inside that".
   */
  const contained = signals.containment ?? 0
  if (contained >= THRESHOLD.containment) {
    score = Math.max(score, 0.55)
    reasons.push(
      "One of these appears in full inside the other — it may be a reprint rather than a duplicate.",
    )
  }

  const level: Verdict["level"] =
    score >= 0.85 ? "likely" : score >= THRESHOLD.flag ? "possible" : "distinct"

  if (level === "distinct") reasons.length = 0

  return { score: round(score), level, reasons }
}

/** Convenience for the common case of comparing two titles alone. */
export function scoreTitles(a: string, b: string): Verdict {
  return scoreDuplicate({ title: titleSimilarity(a, b) })
}

const pct = (n: number) => `${Math.round(n * 100)}%`
const round = (n: number) => Math.round(n * 1000) / 1000
