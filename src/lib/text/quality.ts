/**
 * How well did OCR read this page? ARCHITECTURE.md §7.
 *
 * Neither engine straightens pages, so a skewed photo, a curved book spine or
 * a dark exposure produces confident nonsense rather than an error. Without a
 * score, those pages sit silently in the index poisoning search. With one,
 * they surface in the re-read queue.
 *
 * Calibrated against what the bake-off actually saw. tesseract.js on a
 * photographed two-column page produced:
 *
 *   "C— | / p . / Keys For Successful Building / tech? oo] What project has
 *    God given you lo / = work on? ... BENE can be sure there is o"
 *
 * against macOS Vision's clean read of the same page. The junk is recognisable
 * without a dictionary: tokens with no vowels, lone symbols, stray digits.
 *
 * Pure by design (CLAUDE.md): no database, no network, no environment.
 */

export type Quality = {
  /** 0 (unusable) to 1 (clean). */
  score: number
  /** Why, in plain words — shown in the admin re-read queue. */
  notes: string[]
  /** Below this, do not trust the text for search or duplicate detection. */
  usable: boolean
}

/** Text scoring below this goes into the re-read queue. */
export const USABLE_THRESHOLD = 0.55

const VOWELS = /[aeiouy]/

/** A token that no English word would produce. */
function isJunk(token: string): boolean {
  if (token.length === 0) return true
  // Pure punctuation or symbols: "C—", "|", "="
  if (!/[a-z0-9]/i.test(token)) return true
  // Letters with no vowel and more than two of them: "BENE" passes, "tchw" fails
  if (/^[a-z]+$/i.test(token) && token.length > 2 && !VOWELS.test(token.toLowerCase())) return true
  // Letter-digit soup: "oo]", "l0ve1"
  if (/[a-z]/i.test(token) && /\d/.test(token) && token.length <= 6) return true
  return false
}

export function scoreText(text: string): Quality {
  const notes: string[] = []
  const trimmed = text.trim()

  if (trimmed.length === 0) {
    return { score: 0, notes: ["No text was read from this page."], usable: false }
  }

  const tokens = trimmed.split(/\s+/)

  if (tokens.length < 20) {
    notes.push("Very little text was read — the page may be an image or a cover.")
  }

  const junk = tokens.filter(isJunk).length
  const junkRatio = junk / tokens.length

  const singles = tokens.filter((t) => t.length === 1 && /[a-z0-9]/i.test(t)).length
  const singleRatio = singles / tokens.length

  const letters = (trimmed.match(/[a-z]/gi) ?? []).length
  const letterRatio = letters / trimmed.length

  const avgWord = tokens.reduce((n, t) => n + t.length, 0) / tokens.length

  if (junkRatio > 0.15) notes.push(`${pct(junkRatio)} of words look like OCR noise.`)
  if (singleRatio > 0.2) notes.push("The text is broken into stray single letters.")
  if (letterRatio < 0.6) notes.push("Much of the text is punctuation or symbols rather than words.")
  if (avgWord < 2.5) notes.push("Words are unusually short, which suggests a poor read.")

  // Start from a clean read and deduct; each factor is independently damning.
  let score = 1
  score -= Math.min(0.6, junkRatio * 2)
  score -= Math.min(0.3, Math.max(0, singleRatio - 0.05) * 1.5)
  score -= Math.min(0.3, Math.max(0, 0.75 - letterRatio))
  if (tokens.length < 20) score -= 0.15

  score = Math.max(0, Math.min(1, score))

  if (notes.length === 0) notes.push("The text reads cleanly.")

  return { score: round(score), notes, usable: score >= USABLE_THRESHOLD }
}

const pct = (n: number) => `${Math.round(n * 100)}%`
const round = (n: number) => Math.round(n * 1000) / 1000
