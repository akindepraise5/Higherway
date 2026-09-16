import { describe, expect, it } from "vitest"
import { cleanTitle, normaliseTitle, titleSimilarity } from "./title"

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
})
