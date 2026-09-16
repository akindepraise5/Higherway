import { describe, expect, it } from "vitest"
import { pageItems, pageRange } from "./pagination"

const render = (items: ReturnType<typeof pageItems>) =>
  items.map((i) => (i === "gap" ? "…" : String(i))).join(" ")

describe("pageItems", () => {
  it("shows every page when there are few", () => {
    expect(render(pageItems(1, 3))).toBe("1 2 3")
  })

  it("keeps the first and last reachable in one click", () => {
    const items = pageItems(7, 14)
    expect(items[0]).toBe(1)
    expect(items[items.length - 1]).toBe(14)
  })

  it("puts gaps on both sides when the reader is in the middle", () => {
    expect(render(pageItems(7, 14))).toBe("1 … 6 7 8 … 14")
  })

  it("has no leading gap at the start", () => {
    expect(render(pageItems(1, 14))).toBe("1 2 … 14")
  })

  it("has no trailing gap at the end", () => {
    expect(render(pageItems(14, 14))).toBe("1 … 13 14")
  })

  /** A gap that hides exactly one page wastes the space it saves. */
  it("shows the single page a gap would have hidden", () => {
    expect(render(pageItems(3, 5))).toBe("1 2 3 4 5")
  })

  it("never repeats a page", () => {
    for (let page = 1; page <= 14; page++) {
      const numbers = pageItems(page, 14).filter((i) => i !== "gap")
      expect(new Set(numbers).size).toBe(numbers.length)
    }
  })

  it("always includes the current page", () => {
    for (let page = 1; page <= 14; page++) {
      expect(pageItems(page, 14)).toContain(page)
    }
  })

  it("stays narrow enough for a phone", () => {
    for (let page = 1; page <= 100; page++) {
      expect(pageItems(page, 100).length).toBeLessThanOrEqual(9)
    }
  })

  it("copes with nonsense rather than throwing", () => {
    expect(pageItems(0, 0)).toEqual([])
    expect(pageItems(99, 3)).toContain(3)
    expect(pageItems(-5, 4)).toContain(1)
  })
})

describe("pageRange", () => {
  it("describes where the reader is in the whole", () => {
    expect(pageRange(2, 48, 651)).toEqual({ from: 49, to: 96, total: 651 })
  })

  it("does not overshoot on the last page", () => {
    expect(pageRange(14, 48, 651)).toEqual({ from: 625, to: 651, total: 651 })
  })

  it("reads sensibly when there is nothing", () => {
    expect(pageRange(1, 48, 0)).toEqual({ from: 0, to: 0, total: 0 })
  })
})
