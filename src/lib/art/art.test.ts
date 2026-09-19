import { describe, expect, it } from "vitest"
import { coverArt } from "./cover"
import { allSwatches, FAMILIES, lookFor, SCENES, topicLook } from "./palette"
import { hash, rng, uid } from "./seed"

describe("seed", () => {
  it("hashes the same string to the same number, always", () => {
    expect(hash("the-way-of-holiness")).toBe(hash("the-way-of-holiness"))
    expect(hash("faith")).not.toBe(hash("prayer"))
  })

  it("produces a repeatable sequence from a seed", () => {
    const a = rng(hash("faith"))
    const b = rng(hash("faith"))
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it("stays within 0 and 1", () => {
    const r = rng(12345)
    for (let i = 0; i < 200; i++) {
      const n = r()
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(1)
    }
  })

  it("gives different seeds different gradient ids", () => {
    // Two covers on one grid must not share a gradient id, or the second
    // silently adopts the first's colours.
    expect(uid("a")).not.toBe(uid("b"))
    expect(uid("faith")).toBe(uid("faith"))
  })
})

/** Largest minus smallest RGB channel: how far a colour is from grey. */
function chroma(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return Math.max(...c) - Math.min(...c)
}

describe("the colour system", () => {
  const colours = allSwatches().flatMap((s) => [
    ...s.sky,
    s.sun,
    s.glow,
    ...s.hills,
    s.water,
    s.field,
  ])

  it("is written in plain hex, so it can be read and audited", () => {
    for (const c of colours) expect(c).toMatch(/^#[0-9A-F]{6}$/)
  })

  it("stays restrained — nothing neon or saturated", () => {
    // Cream, beige, sage, olive, forest, earth, charcoal and gold all sit well
    // inside this. A bright red is around 200; a neon green is 255.
    for (const c of colours) expect(chroma(c)).toBeLessThanOrEqual(110)
  })

  it("gives every family light editions and at least one deep one", () => {
    const all = allSwatches()
    expect(all).toHaveLength(FAMILIES.length * 4)
    for (let f = 0; f < FAMILIES.length; f++) {
      const tones = all.slice(f * 4, f * 4 + 4).map((s) => s.tone)
      expect(tones).toContain("light")
      expect(tones).toContain("deep")
    }
  })
})

describe("topic families", () => {
  it("gives a topic the same family and scenes every time", () => {
    expect(topicLook("faith")).toEqual(topicLook("faith"))
    expect(topicLook("some-new-topic")).toEqual(topicLook("some-new-topic"))
  })

  it("files Faith under sage, with the valley and the river", () => {
    expect(topicLook("faith")).toEqual({ family: "sage", scenes: ["valley", "river"] })
  })

  it("keeps every material on a shelf inside that shelf's family and scenes", () => {
    for (const topic of ["faith", "prayer", "holiness", "a-topic-added-next-year"]) {
      const { family, scenes } = topicLook(topic)
      for (let i = 0; i < 60; i++) {
        const look = lookFor(`material-${i}`, topic)
        expect(look.family).toBe(family)
        expect(scenes).toContain(look.scene)
      }
    }
  })

  it("makes materials on one shelf kin, not copies", () => {
    const covers = new Set(
      Array.from({ length: 30 }, (_, i) => {
        const l = lookFor(`faith-material-${i}`, "faith")
        return `${l.scene}|${l.swatch.sky.join()}`
      }),
    )
    // Two scenes by four editions: a shelf of thirty should use most of them.
    expect(covers.size).toBeGreaterThanOrEqual(5)
  })

  it("gives a material the same look for ever", () => {
    expect(lookFor("the-way-of-holiness", "holiness")).toEqual(
      lookFor("the-way-of-holiness", "holiness"),
    )
  })

  it("gives a material with no topic a look of its own, from the system", () => {
    const look = lookFor("stray", "uncategorised")
    expect(FAMILIES).toContain(look.family)
    expect(SCENES).toContain(look.scene)
  })
})

describe("coverArt", () => {
  const look = lookFor("the-way-of-holiness", "holiness")
  const svg = coverArt({ look, seed: "the-way-of-holiness" })

  it("draws the same cover for the same material, every time", () => {
    expect(coverArt({ look, seed: "the-way-of-holiness" })).toBe(svg)
  })

  it("draws a different cover for a different material", () => {
    const other = lookFor("a-purpose-in-pain", "holiness")
    expect(coverArt({ look: other, seed: "a-purpose-in-pain" })).not.toBe(svg)
  })

  it("is a self-contained SVG, shaped for the card and the standing cover", () => {
    expect(svg.startsWith("<svg")).toBe(true)
    expect(svg.endsWith("</svg>")).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('viewBox="0 0 400 500"')
    expect(coverArt({ look, seed: "x", frame: "cover" })).toContain('viewBox="0 0 400 533"')
  })

  it("is decorative, so screen readers skip it", () => {
    expect(svg).toContain('aria-hidden="true"')
  })

  it("draws every scene in every frame without failing", () => {
    for (const scene of SCENES) {
      for (const frame of ["plate", "cover"] as const) {
        const art = coverArt({ look: { ...look, scene }, seed: `seed-${scene}`, frame })
        expect(art.startsWith("<svg")).toBe(true)
        expect(art).not.toContain("NaN")
        expect(art.length).toBeGreaterThan(400)
      }
    }
  })

  it("scopes gradient ids to the material, so a grid does not bleed colours", () => {
    const a = coverArt({ look: lookFor("one", "faith"), seed: "one" })
    const b = coverArt({ look: lookFor("two", "faith"), seed: "two" })
    const idOf = (s: string) => s.match(/id="sky([^"]+)"/)?.[1]
    expect(idOf(a)).toBeDefined()
    expect(idOf(a)).not.toBe(idOf(b))
  })

  it("contains no script or external reference", () => {
    expect(svg).not.toContain("<script")
    expect(svg).not.toContain("<image")
    expect(svg).not.toMatch(/href=/)

    // The only URL in a cover is the SVG namespace declaration, which is a
    // required attribute and not a fetch. Anything else would mean a cover
    // reaching out to the network to draw itself.
    expect(svg.match(/https?:\/\/[^"']+/g) ?? []).toEqual(["http://www.w3.org/2000/svg"])
  })
})
