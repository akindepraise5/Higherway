import { describe, expect, it } from "vitest"
import { dehyphenate, joinHyphenatedLines } from "./dehyphenate"

/**
 * Every case below is real text from this archive, found by inspecting all 94
 * hyphen breaks in its embedded text before writing any of them back. Twelve
 * would have been corrupted by a naive join, and those twelve are the reason
 * this file exists.
 */
describe("joinHyphenatedLines", () => {
  it("puts back together a word the printer broke", () => {
    expect(
      joinHyphenatedLines(["unto life. Verse 6 continues, “And ye became fol-", "lowers of us"]),
    ).toEqual(["unto life. Verse 6 continues, “And ye became followers of us"])
  })

  it("handles the common shapes", () => {
    const pairs: [string, string, string][] = [
      [
        "it would be nice if we were saved and immediate-",
        "ly translated",
        "immediately translated",
      ],
      ["called you unto his king-", "dom and glory", "kingdom and glory"],
      ["we are chal-", "lenged to walk", "challenged to walk"],
      ["an evidence of human-", "ity.", "humanity."],
    ]
    for (const [a, b, expected] of pairs) {
      expect(joinHyphenatedLines([a, b])[0]).toContain(expected)
    }
  })

  it("keeps the hyphen in a number compound", () => {
    // "one-third" became "onethird" before this guard existed.
    expect(joinHyphenatedLines(["will not be lit for one-", "third of the day"])[0]).toBe(
      "will not be lit for one-third of the day",
    )
    expect(joinHyphenatedLines(["a four-", "part series"])[0]).toBe("a four-part series")
    expect(joinHyphenatedLines(["a two-", "handed grip"])[0]).toBe("a two-handed grip")
  })

  it("keeps the hyphen in a wrapped URL", () => {
    // Four of these are in the archive. Removing a hyphen breaks the address.
    const out = joinHyphenatedLines([
      "https://example.org/2017/08/08/gay-marriage-",
      "around-the-world-2013",
    ])
    expect(out[0]).toBe("https://example.org/2017/08/08/gay-marriage-around-the-world-2013")
  })

  it("keeps the hyphen in a chain that already has one", () => {
    expect(joinHyphenatedLines(["a down-to-", "earth man"])[0]).toBe("a down-to-earth man")
    // A preacher spelling a word out, letter by letter.
    expect(joinHyphenatedLines(["wholly—w-h-o-", "l-l-y—to God"])[0]).toBe(
      "wholly—w-h-o-l-l-y—to God",
    )
  })

  it("keeps the hyphen after a digit", () => {
    expect(joinHyphenatedLines(["/stories/215-million-", "believers"])[0]).toBe(
      "/stories/215-million-believers",
    )
  })

  it("repairs the words an over-eager prefix list broke", () => {
    // Not hypothetical, and not merely a design worry: an earlier KEEPS_HYPHEN
    // containing "re", "pre" and "ex" ran during a full re-read and wrote
    // "re-ceived" into 46 pages of this archive, "ex-ample" into 15 and
    // "pre-sent" into 5. These are the exact strings found there.
    expect(dehyphenate("and re-\nceived salvation")).toBe("and received salvation")
    expect(dehyphenate("two re-\nceived Pentecost")).toBe("two received Pentecost")
    expect(dehyphenate("for ex-\nample, consider")).toBe("for example, consider")
    expect(dehyphenate("they pre-\nsented it")).toBe("they presented it")
  })

  it("still keeps the hyphen where the word genuinely has one", () => {
    expect(joinHyphenatedLines(["a study of self-", "denial"])[0]).toBe("a study of self-denial")
  })

  it("joins an ordinary word that merely begins with a prefix", () => {
    // Real, and it caught out an earlier version of this file. The archive
    // quotes 1 Thessalonians 5:23 across a line break as "“pre-" / "served”",
    // and the word is "preserved" — not "pre-served". A prefix list that keeps
    // the hyphen for "pre", "re", "co" or "ex" corrupts far more words than it
    // rescues: received, presented, coming, example.
    expect(joinHyphenatedLines(["we are “pre-", "served”"])[0]).toBe("we are “preserved”")
    expect(joinHyphenatedLines(["he re-", "ceived it"])[0]).toBe("he received it")
    expect(joinHyphenatedLines(["for ex-", "ample"])[0]).toBe("for example")
  })

  it("refuses to join across a page's folio line", () => {
    // The word continues overleaf; what follows is the page furniture.
    expect(
      joinHyphenatedLines(["and prayer is the power that secures that op-", "18 Higher Way"]),
    ).toEqual(["and prayer is the power that secures that op-", "18 Higher Way"])
  })

  it("leaves a dash that ends a clause alone", () => {
    expect(joinHyphenatedLines(["he spoke plainly -", "And then he left"])).toEqual([
      "he spoke plainly -",
      "And then he left",
    ])
  })
})

describe("dehyphenate", () => {
  it("works on text that already exists as one string", () => {
    const before = "granted admis-\nsion to a university\nand a schol-\narship"
    expect(dehyphenate(before)).toBe("granted admission to a university\nand a scholarship")
  })

  it("returns text with nothing to join unchanged", () => {
    const text = "A Place of Surrender\nThis devout Muslim man found peace"
    expect(dehyphenate(text)).toBe(text)
  })
})
