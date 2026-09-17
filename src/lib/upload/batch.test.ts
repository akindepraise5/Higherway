import { describe, expect, it } from "vitest"
import { titleFromFilename, titleFromUrl, titleIsUsable } from "./batch"

describe("titleFromFilename", () => {
  it("drops the extension, whatever its case", () => {
    expect(titleFromFilename("The Anchor.pdf")).toBe("The Anchor")
    expect(titleFromFilename("The Anchor.PDF")).toBe("The Anchor")
  })

  it("turns the separators a file system uses into spaces", () => {
    expect(titleFromFilename("the-cord-of-salvation.pdf")).toBe("the cord of salvation")
    expect(titleFromFilename("Youths_Without_Blemish.pdf")).toBe("Youths Without Blemish")
    expect(titleFromFilename("a--b__c.pdf")).toBe("a b c")
  })

  it("drops the counter a second download picks up", () => {
    expect(titleFromFilename("Higher Way (1).pdf")).toBe("Higher Way")
    expect(titleFromFilename("Higher Way (12).pdf")).toBe("Higher Way")
  })

  it("keeps a number that is part of the title", () => {
    // "(1)" at the end is a copy; a number anywhere else is the material's own.
    expect(titleFromFilename("Questions and answers Vol 1.pdf")).toBe("Questions and answers Vol 1")
    expect(titleFromFilename("1999 and beyond.pdf")).toBe("1999 and beyond")
  })

  it("does not guess at dates or section words, which is the sheet's job", () => {
    expect(titleFromFilename("2018-07-Classics-The-Essence.pdf")).toBe(
      "2018 07 Classics The Essence",
    )
  })

  it("collapses the whitespace a rename leaves behind", () => {
    expect(titleFromFilename("  spaced   out .pdf")).toBe("spaced out")
  })
})

describe("titleIsUsable", () => {
  it("wants two characters that are not whitespace", () => {
    expect(titleIsUsable("ab")).toBe(true)
    expect(titleIsUsable("a")).toBe(false)
    expect(titleIsUsable("   ")).toBe(false)
    expect(titleIsUsable("")).toBe(false)
  })
})

describe("titleFromUrl", () => {
  it("takes the last segment and cleans it the same way", () => {
    expect(titleFromUrl("https://example.com/files/the-anchor.pdf")).toBe("the anchor")
  })

  it("decodes what the browser escaped", () => {
    expect(titleFromUrl("https://example.com/The%20Anchor.pdf")).toBe("The Anchor")
  })

  it("ignores a trailing slash rather than returning nothing", () => {
    expect(titleFromUrl("https://example.com/files/the-anchor.pdf/")).toBe("the anchor")
  })

  it("gives an empty string when there is nothing to take, rather than inventing one", () => {
    expect(titleFromUrl("https://example.com/")).toBe("")
    expect(titleFromUrl("not a url")).toBe("")
  })
})
