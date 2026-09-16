import { describe, expect, it } from "vitest"
import { containment, jaccard, shingles, textSimilarity, words } from "./similarity"

/**
 * The scenario this has to survive: the same printed page photographed twice,
 * read by OCR twice, with a few words misread each time. Text below is the
 * real bake-off output for one page, and a plausible second read of it.
 */
const READ_ONE =
  "Keys For Successful Building What project has God given you to work on? If you are a Christian, you can be sure there is one. We read in the scriptures of many who built."
const READ_TWO =
  "Keys For Successful Building What project has God given you lo work on? If you are a Christian, you can be sure there is one. We read in the scriptures of many who buiIt."

const DIFFERENT =
  "A Purpose in Pain. There are seasons that ask more of us than we believe we have to give, and in them God is not absent but near."

describe("words", () => {
  it("strips punctuation and case", () => {
    expect(words("Hello, World!  It's fine.")).toEqual(["hello", "world", "it", "s", "fine"])
  })

  it("returns nothing for empty text", () => {
    expect(words("   ")).toEqual([])
  })
})

describe("shingles", () => {
  it("produces overlapping runs of words", () => {
    const s = shingles("one two three four five six", 5)
    expect(s.has("one two three four five")).toBe(true)
    expect(s.has("two three four five six")).toBe(true)
    expect(s.size).toBe(2)
  })

  it("keeps short text comparable with itself", () => {
    const s = shingles("only three words", 5)
    expect(s.size).toBe(1)
    expect(textSimilarity("only three words", "only three words")).toBe(1)
  })

  it("returns an empty set for empty text", () => {
    expect(shingles("").size).toBe(0)
  })
})

describe("jaccard", () => {
  it("treats two empty sets as identical", () => {
    expect(jaccard(new Set(), new Set())).toBe(1)
  })

  it("treats one empty set as sharing nothing", () => {
    expect(jaccard(new Set(["a"]), new Set())).toBe(0)
  })

  it("is symmetric", () => {
    const a = new Set(["x", "y"])
    const b = new Set(["y", "z"])
    expect(jaccard(a, b)).toBe(jaccard(b, a))
  })
})

describe("textSimilarity", () => {
  /**
   * 0.7, not 0.8. Measured: two reads of the same page score 0.778 at the
   * chosen shingle size. No size reaches 0.8 on a passage this short, because
   * each misread word costs a fixed number of shingles however long the text
   * is. Longer pages recover; the threshold reflects the worst case.
   */
  it("still recognises the same page read twice with OCR errors", () => {
    expect(textSimilarity(READ_ONE, READ_TWO)).toBeGreaterThan(0.7)
  })

  it("does not confuse two different materials", () => {
    expect(textSimilarity(READ_ONE, DIFFERENT)).toBeLessThan(0.1)
  })

  it("scores identical text as 1", () => {
    expect(textSimilarity(READ_ONE, READ_ONE)).toBe(1)
  })

  /**
   * The assertion that stops the thresholds being tuned until everything
   * passes: a real duplicate must outscore a reprint-inside-a-booklet by a
   * clear margin, or the signal cannot tell the two apart at all.
   */
  it("separates a true duplicate from an article inside a booklet", () => {
    const booklet = `${DIFFERENT} ${READ_ONE} ${DIFFERENT} ${DIFFERENT}`
    const duplicate = textSimilarity(READ_ONE, READ_TWO)
    const reprint = textSimilarity(READ_ONE, booklet)
    expect(duplicate - reprint).toBeGreaterThan(0.2)
  })
})

describe("containment", () => {
  it("catches a short article reprinted inside a longer booklet", () => {
    const booklet = `${DIFFERENT} ${READ_ONE} ${DIFFERENT} ${DIFFERENT}`
    // Overlap is diluted by the booklet's length; containment is not, which is
    // exactly why this is a separate signal rather than blended into the above.
    expect(textSimilarity(READ_ONE, booklet)).toBeLessThan(0.6)
    expect(containment(READ_ONE, booklet)).toBeGreaterThan(0.9)
  })

  it("is 0 when either side has no text", () => {
    expect(containment("", READ_ONE)).toBe(0)
  })
})
