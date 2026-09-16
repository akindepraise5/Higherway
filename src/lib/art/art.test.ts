import { describe, expect, it } from "vitest"
import { coverArt } from "./cover"
import { hsl, lookFor, MOTIFS, paletteFor, topicTheme } from "./palette"
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

describe("topicTheme", () => {
  it("gives a topic the same look every time", () => {
    expect(topicTheme("faith")).toEqual(topicTheme("faith"))
  })

  it("gives different topics different looks", () => {
    expect(topicTheme("faith").hue).not.toBe(topicTheme("prayer").hue)
  })

  it("only ever uses a known motif", () => {
    for (const topic of ["faith", "prayer", "holiness", "uncategorised", "some-new-topic"]) {
      expect(MOTIFS).toContain(topicTheme(topic).motif)
    }
  })

  it("keeps hues in the dusk range, never a primary", () => {
    for (const topic of ["faith", "prayer", "victory", "heaven", "love"]) {
      const { hue } = topicTheme(topic)
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(360)
    }
  })
})

describe("paletteFor", () => {
  it("makes two materials on one shelf kin, not copies", () => {
    const theme = topicTheme("faith")
    const a = paletteFor(theme, "the-way-of-holiness")
    const b = paletteFor(theme, "a-purpose-in-pain")

    // The palettes differ overall, which is what "kin, not copies" means.
    // Individual stops may coincide — two seeds can land on the same nudge,
    // and a shared base sky is the point of a shelf reading as one shelf.
    expect(a).not.toEqual(b)
  })

  it("is stable for one material", () => {
    const theme = topicTheme("faith")
    expect(paletteFor(theme, "x")).toEqual(paletteFor(theme, "x"))
  })

  it("produces valid colours", () => {
    const palette = paletteFor(topicTheme("prayer"), "some-material")
    for (const colour of [...palette.sky, palette.sun, ...palette.ridges]) {
      expect(colour).toMatch(/^hsl\(\d+,\d+%,\d+%\)$/)
    }
  })
})

describe("hsl", () => {
  it("wraps hues round the circle", () => {
    expect(hsl(370, 50, 50)).toBe("hsl(10,50%,50%)")
    expect(hsl(-10, 50, 50)).toBe("hsl(350,50%,50%)")
  })

  it("clamps saturation and lightness rather than emitting nonsense", () => {
    expect(hsl(200, 150, -20)).toBe("hsl(200,100%,0%)")
  })
})

describe("coverArt", () => {
  const look = lookFor("the-way-of-holiness", "holiness")
  const svg = coverArt({ ...look, seed: "the-way-of-holiness" })

  it("draws the same cover for the same material, every time", () => {
    expect(coverArt({ ...look, seed: "the-way-of-holiness" })).toBe(svg)
  })

  it("draws a different cover for a different material", () => {
    const other = lookFor("a-purpose-in-pain", "holiness")
    expect(coverArt({ ...other, seed: "a-purpose-in-pain" })).not.toBe(svg)
  })

  it("is a self-contained SVG", () => {
    expect(svg.startsWith("<svg")).toBe(true)
    expect(svg.endsWith("</svg>")).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('viewBox="0 0 400 500"')
  })

  it("is decorative, so screen readers skip it", () => {
    expect(svg).toContain('aria-hidden="true"')
  })

  it("draws every motif without failing", () => {
    for (const motif of MOTIFS) {
      const art = coverArt({ motif, palette: look.palette, seed: `seed-${motif}` })
      expect(art.startsWith("<svg")).toBe(true)
      expect(art.length).toBeGreaterThan(200)
    }
  })

  it("scopes gradient ids to the material, so a grid does not bleed colours", () => {
    const a = coverArt({ ...lookFor("one", "faith"), seed: "one" })
    const b = coverArt({ ...lookFor("two", "faith"), seed: "two" })
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
