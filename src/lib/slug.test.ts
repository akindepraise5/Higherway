import { describe, expect, it } from "vitest"
import { slugify, uniqueSlug } from "./slug"

describe("slugify", () => {
  it("makes a readable URL from a title", () => {
    expect(slugify("The Way of Holiness")).toBe("the-way-of-holiness")
  })

  it("keeps possessives readable", () => {
    expect(slugify("My way or God's way")).toBe("my-way-or-gods-way")
  })

  it("collapses punctuation rather than leaving dashes everywhere", () => {
    expect(slugify("A new life for 'Presley' park!")).toBe("a-new-life-for-presley-park")
  })

  it("strips accents", () => {
    expect(slugify("Café con Dios")).toBe("cafe-con-dios")
  })

  it("never ends on a dash, even when cut short", () => {
    const slug = slugify(`${"a".repeat(58)} and then some more words`)
    expect(slug.endsWith("-")).toBe(false)
    expect(slug.length).toBeLessThanOrEqual(60)
  })

  it("falls back rather than returning an empty slug", () => {
    expect(slugify("!!!")).toBe("item")
    expect(slugify("")).toBe("item")
  })

  it("is stable — a published slug must never drift", () => {
    expect(slugify("5 keys for successful building")).toBe("5-keys-for-successful-building")
  })
})

describe("uniqueSlug", () => {
  it("returns the plain slug when nothing has taken it", () => {
    expect(uniqueSlug("A Total Commitment", new Set())).toBe("a-total-commitment")
  })

  /** This title really does appear three times in the archive. */
  it("numbers the repeats of a title that appears three times", () => {
    const taken = new Set<string>()
    const slugs = [0, 1, 2].map(() => {
      const slug = uniqueSlug("5 keys for successful building", taken)
      taken.add(slug)
      return slug
    })

    expect(slugs).toEqual([
      "5-keys-for-successful-building",
      "5-keys-for-successful-building-2",
      "5-keys-for-successful-building-3",
    ])
    expect(new Set(slugs).size).toBe(3)
  })

  it("skips a number already in use", () => {
    const taken = new Set(["faith", "faith-2"])
    expect(uniqueSlug("Faith", taken)).toBe("faith-3")
  })
})
