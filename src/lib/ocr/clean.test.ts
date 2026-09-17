import { describe, expect, it } from "vitest"
import { looksInvented, stripInvented, survivingShare } from "./clean"

describe("looksInvented", () => {
  it("catches the consonant runs an engine makes from a photograph", () => {
    expect(looksInvented("qwrtpz")).toBe(true)
    expect(looksInvented("khjgf")).toBe(true)
  })

  it("keeps ordinary words", () => {
    for (const word of ["salvation", "the", "prayer", "Lord", "Christianity"]) {
      expect(looksInvented(word)).toBe(false)
    }
  })

  it("keeps words whose only vowel is y", () => {
    // Without y as a vowel these are all junk, and this archive uses every one.
    for (const word of ["why", "rhythm", "myth", "hymn", "thy", "dry"]) {
      expect(looksInvented(word)).toBe(false)
    }
  })

  it("keeps the Bible versions this archive quotes, none of which has a vowel", () => {
    for (const version of ["KJV", "NKJV", "RSV", "NLT", "LXX"]) {
      expect(looksInvented(version)).toBe(false)
    }
  })

  it("never touches a short token", () => {
    // Page numbers, "I", "a", and any two-letter abbreviation.
    for (const token of ["I", "a", "of", "12", "St", "Dr"]) {
      expect(looksInvented(token)).toBe(false)
    }
  })

  it("judges the word inside the punctuation, not the punctuation", () => {
    expect(looksInvented('"salvation,"')).toBe(false)
    expect(looksInvented("(prayer)")).toBe(false)
    expect(looksInvented("qwrtpz,")).toBe(true)
  })

  it("catches a run of one symbol, which is a rule or a torn edge", () => {
    expect(looksInvented("~~~~")).toBe(true)
    expect(looksInvented("|||")).toBe(true)
    // Two is not a run; an em-dash pair is real typography.
    expect(looksInvented("--")).toBe(false)
  })

  it("keeps anything with no letters at all", () => {
    expect(looksInvented("1999")).toBe(false)
    expect(looksInvented("3:16")).toBe(false)
  })
})

describe("stripInvented", () => {
  it("removes the junk and leaves the sentence", () => {
    expect(stripInvented("the Lord qwrtpz is my shepherd")).toBe("the Lord is my shepherd")
  })

  it("keeps the line structure the column ordering produced", () => {
    // Re-joining would collapse these, and de-hyphenation depends on the lines.
    expect(stripInvented("first line khjgf\nsecond line")).toBe("first line\nsecond line")
  })

  it("leaves clean text exactly as it was", () => {
    const clean = "I had been brought up in a good\nhome where the Lord was honoured"
    expect(stripInvented(clean)).toBe(clean)
  })

  it("does not leave double spaces where a token was", () => {
    expect(stripInvented("a qwrtpz b")).toBe("a b")
  })
})

describe("survivingShare", () => {
  it("is 1 when nothing was removed", () => {
    expect(survivingShare("the Lord is good", "the Lord is good")).toBe(1)
  })

  it("reports how much of a photographed page was invented", () => {
    expect(survivingShare("a b c d", "a b")).toBe(0.5)
  })

  it("treats an empty page as intact rather than dividing by zero", () => {
    expect(survivingShare("", "")).toBe(1)
  })
})
