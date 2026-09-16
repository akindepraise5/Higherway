import { describe, expect, it } from "vitest"
import { hasUsableText, READING_WIDTH, THUMB_WIDTH, WEBP_QUALITY } from "./render"

/**
 * Rendering itself needs a real PDF and a WASM runtime, so it is exercised by
 * the backfill rather than here — these cover the decision that routes a
 * document down the free path or the OCR path, which is pure and is the part
 * most likely to be got wrong.
 */

describe("hasUsableText", () => {
  const page = (text: string, pageNumber = 1) => ({ pageNumber, text })

  it("accepts a born-digital PDF", () => {
    // The real first page of a sample from this archive: 3,249 characters.
    expect(hasUsableText([page("x".repeat(3249))])).toBe(true)
  })

  it("rejects a scan carrying only a scanner's header stamp", () => {
    expect(hasUsableText([page("January - March 2017"), page("", 2)])).toBe(false)
  })

  it("rejects pages with no text at all", () => {
    expect(hasUsableText([page(""), page("", 2)])).toBe(false)
  })

  it("rejects an empty document rather than claiming it has text", () => {
    expect(hasUsableText([])).toBe(false)
  })

  it("averages across pages, so one rich page does not carry a scanned book", () => {
    const pages = [page("x".repeat(900))]
    for (let i = 2; i <= 10; i++) pages.push(page("", i))
    expect(hasUsableText(pages)).toBe(false)
  })

  it("accepts a document where every page has real text", () => {
    const pages = [1, 2, 3].map((n) => page("x".repeat(600), n))
    expect(hasUsableText(pages)).toBe(true)
  })
})

describe("render settings", () => {
  /**
   * These are measured values, not preferences — quality 72 gives ~200-280 KB
   * a page against ~490 KB at 80 on this archive's photographic scans. Changing
   * them changes the storage estimate in ARCHITECTURE.md §7.
   */
  it("keeps the measured defaults", () => {
    expect(READING_WIDTH).toBe(1400)
    expect(WEBP_QUALITY).toBe(72)
    expect(THUMB_WIDTH).toBe(360)
  })
})
