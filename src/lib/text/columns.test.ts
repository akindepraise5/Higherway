import { describe, expect, it } from "vitest"
import { readingOrder, type TextBox } from "./columns"

/**
 * Vision's coordinates are normalised with the origin at the bottom-left, so a
 * line near the top of the page has a *high* y. These helpers keep the tests
 * readable by taking a top-down row instead.
 */
const line = (text: string, x: number, width: number, row: number, height = 0.02): TextBox => ({
  text,
  confidence: 0.97,
  x,
  width,
  height,
  y: 1 - row * 0.03 - height,
})

const LEFT = 0.08
const RIGHT = 0.52
const COL = 0.38

describe("readingOrder", () => {
  it("keeps a single column in the order it was read", () => {
    const boxes = [
      line("The New Testament church at Thessalonica was", LEFT, COL, 1),
      line("established during difficult times. When Paul", LEFT, COL, 2),
      line("first went to that city with the Gospel", LEFT, COL, 3),
    ]

    expect(readingOrder(boxes).split("\n")).toEqual([
      "The New Testament church at Thessalonica was",
      "established during difficult times. When Paul",
      "first went to that city with the Gospel",
    ])
  })

  it("reads two columns down, not across", () => {
    // Exactly the failure from the archive: Vision returns these interleaved,
    // left line then right line, and joining them weaves two articles together.
    const boxes = [
      line("from my youth to practice the Muslim", LEFT, COL, 1),
      line("I wrote to my parents and relatives.", RIGHT, COL, 1),
      line("way of prayer, praying five times a day", LEFT, COL, 2),
      line("prise, they rejected me and said I should", RIGHT, COL, 2),
    ]

    expect(readingOrder(boxes).split("\n")).toEqual([
      "from my youth to practice the Muslim",
      "way of prayer, praying five times a day",
      "I wrote to my parents and relatives.",
      "prise, they rejected me and said I should",
    ])
  })

  it("puts a headline above both columns", () => {
    // Sized as they really are on the page: the headline covers about 75% of
    // the text block and is set much larger, the standfirst about 60% and
    // centred. A headline spanning the *entire* block at body height would be
    // indistinguishable from a line the reader's eye — and the OCR — ran
    // straight across, which is the case the next test covers.
    const boxes = [
      line("A Place of Surrender", 0.12, 0.62, 0, 0.055),
      line("This devout Muslim man found peace", 0.2, 0.45, 1),
      line("left column first line", LEFT, COL, 2),
      line("right column first line", RIGHT, COL, 2),
      line("left column second line", LEFT, COL, 3),
      line("right column second line", RIGHT, COL, 3),
    ]

    expect(readingOrder(boxes).split("\n")).toEqual([
      "A Place of Surrender",
      "This devout Muslim man found peace",
      "left column first line",
      "left column second line",
      "right column first line",
      "right column second line",
    ])
  })

  it("rejoins a drop cap with the word it started", () => {
    const boxes = [
      line("B", LEFT, 0.04, 1),
      line("orn into a Muslim family, I was trained", LEFT + 0.05, 0.33, 1),
    ]

    expect(readingOrder(boxes)).toBe("Born into a Muslim family, I was trained")
  })

  it("does not merge a real one-letter line into the next sentence", () => {
    // A capital followed by a capital is not a drop cap losing its word.
    const boxes = [line("I", LEFT, 0.02, 1), line("Thessalonians 3:12", LEFT, 0.3, 2)]

    expect(readingOrder(boxes).split("\n")).toEqual(["I", "Thessalonians 3:12"])
  })

  it("handles three columns", () => {
    const boxes = [
      line("one a", 0.05, 0.25, 1),
      line("two a", 0.38, 0.25, 1),
      line("three a", 0.7, 0.25, 1),
      line("one b", 0.05, 0.25, 2),
      line("two b", 0.38, 0.25, 2),
      line("three b", 0.7, 0.25, 2),
    ]

    expect(readingOrder(boxes).split("\n")).toEqual([
      "one a",
      "one b",
      "two a",
      "two b",
      "three a",
      "three b",
    ])
  })

  it("cuts a line the reader ran straight across both columns", () => {
    // Vision does this occasionally: one observation holding the end of a
    // left-column line and the start of a right-column one. Breaking the page
    // there would make the article read first column, second column, then first
    // column again — so it is cut at the gutter instead.
    const boxes = [
      line("left one", LEFT, COL, 1),
      line("right one", RIGHT, COL, 1),
      line("of Ramadan. As come home again. They stopped", LEFT, 0.82, 2),
      line("left three", LEFT, COL, 3),
      line("right three", RIGHT, COL, 3),
    ]

    const out = readingOrder(boxes).split("\n")
    // The halves land in their own columns, and nothing is stranded between.
    expect(out.filter((l) => l.includes("of Ramadan")).length).toBe(1)
    expect(out.indexOf("left three")).toBeGreaterThan(out.indexOf("left one"))
    expect(out.indexOf("right three")).toBeGreaterThan(out.indexOf("right one"))
    expect(out.indexOf("left three")).toBeLessThan(out.indexOf("right one"))
  })

  it("puts back together words the printer broke across a line", () => {
    // All four are real breaks from one page of this archive. Left split, none
    // of these words can be searched for.
    const boxes = [
      line("I was still able to pass all the exams and was granted admis-", LEFT, COL, 1),
      line("sion to a university. Once there, however, I did not do well", LEFT, COL, 2),
      line("and it was God Him-", LEFT, COL, 3),
      line("self who gave me the words to say", LEFT, COL, 4),
    ]

    const out = readingOrder(boxes)
    expect(out).toContain("granted admission to a university")
    expect(out).toContain("it was God Himself who gave me")
    expect(out).not.toContain("admis-")
  })

  it("keeps the hyphen where the word really has one", () => {
    // "Self denial" is a material in this archive, so this is not hypothetical.
    const boxes = [
      line("a study of self-", LEFT, COL, 1),
      line("denial and what it costs", LEFT, COL, 2),
    ]
    expect(readingOrder(boxes)).toContain("self-denial and what it costs")
  })

  it("leaves a word broken across a page boundary alone", () => {
    // Real, and found only by accident. The last column line of a page can end
    // mid-word, with the article continuing overleaf — so what follows it is
    // not the rest of the word but the folio line. Joining those would splice
    // "op-" onto "18 Higher Way".
    //
    // This is also why "pages still holding a split word" was a hopeless
    // progress metric: splits like this can never be joined, so the count can
    // never reach zero however long the re-read runs.
    const boxes = [
      line('man wrote, "and prayer is the power that secures that op-', LEFT, COL, 1),
      line("18 Higher Way", LEFT, 0.18, 2),
      line("Scanned by CamScanner", LEFT, 0.26, 3),
    ]

    const out = readingOrder(boxes).split("\n")
    expect(out[0]).toMatch(/that op-$/)
    expect(out[1]).toBe("18 Higher Way")
  })

  it("does not join a hyphen to a line that starts a new sentence", () => {
    // The guard is the lower-case check. A hyphen before a capital is a dash
    // doing its own work, not half of a broken word. Written with a hyphen on
    // purpose: an em-dash would pass this whatever the guard did, because it is
    // not in the character class at all.
    const boxes = [
      line("he spoke to the congregation -", LEFT, COL, 1),
      line("And then he left", LEFT, COL, 2),
    ]
    expect(readingOrder(boxes).split("\n")).toEqual([
      "he spoke to the congregation -",
      "And then he left",
    ])
  })

  it("ignores empty lines and survives an empty page", () => {
    expect(readingOrder([])).toBe("")
    expect(readingOrder([line("   ", LEFT, COL, 1)])).toBe("")
  })
})
