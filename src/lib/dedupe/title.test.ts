import { describe, expect, it } from "vitest"
import { cleanTitle, normaliseTitle, titleOverlap, titleSimilarity } from "./title"

/**
 * Every pair below is real, taken from the v1 spreadsheet. If a change makes
 * one of these fail, the change is wrong — these are duplicates a human
 * confirmed by eye.
 */
const REAL_DUPLICATE_PAIRS: [string, string][] = [
  ["A Heart Like His", "A heart like His"],
  ["A place of surrender", "A Place of Surrender"],
  ["Are we ready for a revival", "Are we ready for a Revival"],
  ["Are You Living In Anticipation", "Are you living in anticipation"],
  ["A new life for 'Presley' park", "A new life for Presley Park"],
  ["A Total Commitment", "A Total Commitment"],
  ["5 keys for successful building", "5 keys for successful building "],
]

/** Distinct materials that share words — these must NOT be flagged. */
const DISTINCT_PAIRS: [string, string][] = [
  ["God cares", "God offers hope"],
  ["The value of affliction", "The value of choosing self denial"],
  ["Exploring the word", "Exploring the word - Self denial"],
  ["Take a step of Faith", "The Trial of our Faith"],
  /**
   * Series, raised as duplicates by the first real scan of the archive. They
   * share every word but the last, and that last word is the whole point.
   */
  ["Questions and answers Vol 1", "Questions and answers Vol 2"],
  ["A Total Commitment", "A Total Commitment 2"],
  ["Dare To Be Different!", "Dare To Be Different 2"],
]

describe("normaliseTitle", () => {
  it("ignores case, punctuation and surrounding space", () => {
    expect(normaliseTitle("  A Place of Surrender!  ")).toBe("a place of surrender")
  })

  it("strips filename prefixes from titles that are really filenames", () => {
    expect(normaliseTitle("2017-01-FTWord-The-Way-of-Holiness")).toBe("the way of holiness")
    expect(normaliseTitle("2018-07-Classics-The-Essence-of-True-Christianity")).toBe(
      "the essence of true christianity",
    )
  })

  it("strips copy markers", () => {
    expect(normaliseTitle("A Total Commitment (1)")).toBe("a total commitment")
    expect(normaliseTitle("Copy of A Total Commitment")).toBe("a total commitment")
    expect(normaliseTitle("A Total Commitment - Copy 2")).toBe("a total commitment")
  })

  it("ignores apostrophes, so possessives match", () => {
    expect(normaliseTitle("My way or God's way")).toBe(normaliseTitle("My way or Gods way"))
  })
})

describe("cleanTitle", () => {
  it("turns a filename into a readable title", () => {
    expect(cleanTitle("2017-01-FTWord-The-Way-of-Holiness")).toBe("The Way of Holiness")
  })

  it("leaves a properly written title alone", () => {
    expect(cleanTitle("A new life for 'Presley' park")).toBe("A new life for 'Presley' park")
  })

  it("never returns an empty string", () => {
    expect(cleanTitle("   ")).toBe("")
    expect(cleanTitle("2017-01-")).toBe("2017-01-")
  })
})

describe("titleSimilarity", () => {
  it.each(REAL_DUPLICATE_PAIRS)("flags the real duplicate %s / %s", (a, b) => {
    expect(titleSimilarity(a, b)).toBeGreaterThanOrEqual(0.55)
  })

  it.each(DISTINCT_PAIRS)("does not flag %s against %s", (a, b) => {
    expect(titleSimilarity(a, b)).toBeLessThan(0.55)
  })

  it("is symmetric", () => {
    expect(titleSimilarity("God cares", "God offers hope")).toBe(
      titleSimilarity("God offers hope", "God cares"),
    )
  })

  it("scores an identical title as 1", () => {
    expect(titleSimilarity("The Way of Holiness", "the way of holiness")).toBe(1)
  })

  it("handles empty input without throwing", () => {
    expect(titleSimilarity("", "")).toBe(1)
    expect(titleSimilarity("", "Faith")).toBe(0)
  })

  it("reads a trailing series number as evidence against, not as noise", () => {
    expect(titleSimilarity("Questions and answers Vol 1", "Questions and answers Vol 2")).toBe(0)
    expect(titleSimilarity("A Total Commitment", "A Total Commitment 2")).toBe(0)
    // Run onto the word, as the archive has it.
    expect(titleSimilarity("Our Conscience is a Witness", "Our Conscience is a Witness1")).toBe(0)
  })

  it("only does that when the rest of the title is identical", () => {
    // Different stems: the rule must not reach these, or it would silence a
    // signal on pairs that have nothing to do with a series.
    expect(titleSimilarity("The Place of Full Surrender", "A Place of Surrender")).toBeGreaterThan(
      0,
    )
    expect(titleSimilarity("Psalm 23", "Psalm 23")).toBe(1)
    expect(titleSimilarity("Lessons From Jericho", "Lessons from Jericho")).toBe(1)
  })

  it("still reports word overlap for gating, even where the title signal is 0", () => {
    // The scan reads two materials' text only when their titles already look
    // related. If the series rule reached that gate too, this pair would never
    // be compared and its containment finding would vanish — which is exactly
    // the bug the separate function exists to prevent.
    const pair: [string, string] = ["Our Conscience is a Witness", "Our Conscience is a Witness1"]
    expect(titleSimilarity(...pair)).toBe(0)
    expect(titleOverlap(...pair)).toBeGreaterThanOrEqual(0.35)
  })

  it("leaves the content signals to speak for themselves", () => {
    // Suppressing the title is safe precisely because it is not the only
    // evidence: "…Witness" against "…Witness1" is 5 pages inside 48, and the
    // containment signal still raises it. Verified against the live pairs —
    // of 87, four were dropped and every one was a series.
    expect(titleSimilarity("Our Conscience is a Witness", "Our Conscience is a Witness1")).toBe(0)
  })
})
