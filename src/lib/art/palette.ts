import { hash, pick } from "./seed"

/**
 * A look for every topic, carried over from v1 and kept deliberately quiet.
 *
 * The topic decides the scene and the colours, so everything filed under Faith
 * reads as one shelf and everything under Holiness as another. The material's
 * own title then nudges the palette a few degrees, so two covers on one shelf
 * come out as kin rather than copies.
 *
 * Add a topic and it is given its own look on the next render — nothing to
 * configure, nothing to pick by hand.
 *
 * Pure by design (CLAUDE.md).
 */

/** The eight marks a cover can carry. One per topic, never more than one. */
export const MOTIFS = ["sun", "peak", "arc", "rings", "moon", "dot", "bars", "halo"] as const
export type Motif = (typeof MOTIFS)[number]

/**
 * Dusk hues only: deep blues through greens, brass, clay and plum. No
 * primaries, nothing that would shout next to the paper.
 */
const TOPIC_HUES = [
  206, 194, 178, 158, 140, 122, 104, 86, 64, 44, 28, 14, 352, 334, 314, 292, 272, 250, 232, 218,
] as const

export type Theme = {
  motif: Motif
  hue: number
  warm: number
  sat: number
  land: number
  sunY: number
  sunR: number
}

export type Palette = {
  sky: [string, string, string]
  sun: string
  sunY: number
  sunR: number
  ridges: [string, string, string, string, string]
}

export const hsl = (h: number, s: number, l: number): string =>
  `hsl(${Math.round(((h % 360) + 360) % 360)},${Math.round(clamp(s))}%,${Math.round(clamp(l))}%)`

const clamp = (n: number) => Math.max(0, Math.min(100, n))

/**
 * The shelf's look, derived from the topic's own name so it holds still while
 * the archive grows. A material with no topic gets a mark of its own rather
 * than sharing one with every other stray.
 */
export function topicTheme(topicId: string): Theme {
  const h = hash(topicId)
  return {
    motif:
      topicId === "uncategorised"
        ? pick(MOTIFS, hash(`${topicId}-own`) >>> 3)
        : pick(MOTIFS, h >>> 3),
    hue: TOPIC_HUES[h % TOPIC_HUES.length],
    warm: 24 + ((h >>> 7) % 14),
    sat: 18 + ((h >>> 11) % 9),
    land: 7 + ((h >>> 15) % 7),
    sunY: 0.54 + ((h >>> 19) % 13) / 100,
    sunR: 32 + ((h >>> 23) % 18),
  }
}

/** The shelf's palette, nudged a few degrees by the material's own identity. */
export function paletteFor(theme: Theme, seedKey: string): Palette {
  const d = hash(seedKey)
  const hue = theme.hue + ((d % 13) - 6)
  const warm = theme.warm + (((d >>> 4) % 9) - 4)
  const lift = ((d >>> 8) % 7) - 3
  const land = theme.land + ((d >>> 12) % 3)

  return {
    sky: [hsl(hue, theme.sat, 30 + lift), hsl(warm, 44, 54), hsl(warm + 10, 74, 80)],
    sun: hsl(warm + 12, 96, 88),
    sunY: theme.sunY + (((d >>> 16) % 9) - 4) / 100,
    sunR: theme.sunR + ((d >>> 20) % 13) - 6,
    ridges: [
      hsl(hue, land, 55 + lift),
      hsl(hue, land, 42 + lift),
      hsl(hue, land + 1, 29 + lift),
      hsl(hue, land + 2, 18),
      hsl(hue, land + 3, 10),
    ],
  }
}

/**
 * Everything needed to draw one material's cover. A material filed under
 * several topics wears the colours of the shelf you are standing at, so a
 * shelf always reads as one shelf; away from a shelf it wears its first topic.
 */
export function lookFor(seedKey: string, topicId: string) {
  const theme = topicTheme(topicId)
  return { motif: theme.motif, palette: paletteFor(theme, seedKey), theme }
}
