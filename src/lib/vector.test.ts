import { describe, expect, it } from "vitest"
import { assertDimensions, cosine, DIMENSIONS, isNormalised, nearest } from "./vector"

const unit = (n: number): number[] => {
  const v = Array.from({ length: n }, (_, i) => Math.sin(i + 1))
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  return v.map((x) => x / mag)
}

describe("cosine", () => {
  it("scores an identical vector as 1", () => {
    const v = unit(384)
    expect(cosine(v, v)).toBeCloseTo(1, 6)
  })

  it("scores an opposite vector as -1", () => {
    const v = unit(8)
    expect(
      cosine(
        v,
        v.map((x) => -x),
      ),
    ).toBeCloseTo(-1, 6)
  })

  it("scores perpendicular vectors as 0", () => {
    expect(cosine([1, 0], [0, 1])).toBe(0)
  })

  it("is symmetric", () => {
    const a = unit(16)
    const b = unit(16).reverse()
    expect(cosine(a, b)).toBeCloseTo(cosine(b, a), 12)
  })

  it("refuses to compare different sizes rather than returning nonsense", () => {
    expect(() => cosine([1, 2, 3], [1, 2])).toThrow(/different sizes/)
  })

  it("returns 0 for a zero vector instead of dividing by zero", () => {
    expect(cosine([0, 0, 0], [1, 2, 3])).toBe(0)
    expect(Number.isNaN(cosine([0, 0], [0, 0]))).toBe(false)
  })

  it("handles empty vectors", () => {
    expect(cosine([], [])).toBe(0)
  })
})

describe("isNormalised", () => {
  it("recognises a unit vector", () => {
    expect(isNormalised(unit(384))).toBe(true)
  })

  it("rejects an unscaled vector", () => {
    expect(isNormalised([3, 4])).toBe(false)
  })

  it("rejects an empty vector", () => {
    expect(isNormalised([])).toBe(false)
  })
})

describe("assertDimensions", () => {
  it("passes a 384-dimension vector, which is what the schema declares", () => {
    expect(() => assertDimensions(unit(DIMENSIONS))).not.toThrow()
  })

  it("explains what to change when the size is wrong", () => {
    expect(() => assertDimensions(unit(768))).toThrow(/re-embedding everything/)
  })
})

describe("nearest", () => {
  it("returns the most similar first", () => {
    const query = [1, 0, 0]
    const results = nearest(query, [
      { item: "perpendicular", embedding: [0, 1, 0] },
      { item: "same", embedding: [1, 0, 0] },
      { item: "opposite", embedding: [-1, 0, 0] },
    ])
    expect(results.map((r) => r.item)).toEqual(["same", "perpendicular", "opposite"])
  })

  it("caps how many it returns", () => {
    const candidates = Array.from({ length: 20 }, (_, i) => ({
      item: i,
      embedding: unit(8),
    }))
    expect(nearest(unit(8), candidates, 3)).toHaveLength(3)
  })

  it("copes with no candidates", () => {
    expect(nearest([1, 0], [])).toEqual([])
  })
})
