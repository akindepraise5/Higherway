import { describe, expect, it } from "vitest"
import { chunkMaterial, chunkPage, documentText, MAX_WORDS, type PageText } from "./chunk"

const sentence = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ")

describe("chunkPage", () => {
  it("keeps a short page as one chunk, with its page number", () => {
    const chunks = chunkPage({ pageNumber: 2, text: "The way of holiness is worked out daily." })
    expect(chunks).toHaveLength(1)
    expect(chunks[0].pageNumber).toBe(2)
  })

  it("splits a long page with overlap, so nothing falls between chunks", () => {
    const chunks = chunkPage({ pageNumber: 1, text: sentence(MAX_WORDS * 2) })
    expect(chunks.length).toBeGreaterThan(1)

    const first = chunks[0].text.split(" ")
    const second = chunks[1].text.split(" ")
    expect(second.slice(0, 5)).toEqual(first.slice(first.length - 40, first.length - 35))
  })

  it("returns nothing for an empty page", () => {
    expect(chunkPage({ pageNumber: 1, text: "   " })).toEqual([])
  })

  it("never emits a chunk longer than the limit", () => {
    for (const chunk of chunkPage({ pageNumber: 1, text: sentence(1000) })) {
      expect(chunk.text.split(" ").length).toBeLessThanOrEqual(MAX_WORDS)
    }
  })
})

describe("chunkMaterial", () => {
  /** The archive averages 1.68 pages, so this is the typical case. */
  const typical: PageText[] = [
    { pageNumber: 1, text: sentence(200) },
    { pageNumber: 2, text: sentence(150) },
  ]

  it("gives a typical two-page material one chunk per page", () => {
    const chunks = chunkMaterial(typical)
    expect(chunks).toHaveLength(2)
    expect(chunks.map((c) => c.pageNumber)).toEqual([1, 2])
  })

  it("does not embed a two-word cover page on its own", () => {
    const chunks = chunkMaterial([
      { pageNumber: 1, text: "Higherway" },
      { pageNumber: 2, text: sentence(100) },
    ])
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toContain("Higherway")
  })

  it("skips blank pages entirely", () => {
    const chunks = chunkMaterial([
      { pageNumber: 1, text: "" },
      { pageNumber: 2, text: sentence(50) },
    ])
    expect(chunks).toHaveLength(1)
    expect(chunks[0].pageNumber).toBe(2)
  })

  it("keeps text from a material that is entirely short pages", () => {
    const chunks = chunkMaterial([
      { pageNumber: 1, text: "one two" },
      { pageNumber: 2, text: "three four" },
    ])
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.map((c) => c.text).join(" ")).toContain("three four")
  })

  it("returns nothing when there is no text at all", () => {
    expect(chunkMaterial([{ pageNumber: 1, text: "  " }])).toEqual([])
  })
})

describe("documentText", () => {
  it("joins pages and caps the length", () => {
    const text = documentText([
      { pageNumber: 1, text: sentence(1000) },
      { pageNumber: 2, text: sentence(1000) },
    ])
    expect(text.split(" ").length).toBe(1200)
  })

  it("is empty when the material has no text", () => {
    expect(documentText([{ pageNumber: 1, text: "" }])).toBe("")
  })
})
