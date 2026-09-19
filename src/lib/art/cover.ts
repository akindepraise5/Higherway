import type { Look, Scene, Swatch } from "./palette"
import { hash, rng, uid } from "./seed"

/**
 * The artwork on every material cover.
 *
 * Drawn in the language of the books on the home page — the hero's fan and the
 * Latest Addition: a paper-toned sky that carries the type, and across the
 * lower half a landscape of soft layered hills in low light, ending in dark
 * ground at the foot. No outlines, no texture, no detail that competes with
 * the title.
 *
 * The topic chooses the family and the two scenes it may use (palette.ts); the
 * material's own name chooses which scene, where the sun sits, how the hills
 * rise and where the water runs — so a shelf reads as one family and no two
 * covers are the same.
 *
 * Returns an SVG string rather than a component, so the same artwork serves a
 * server-rendered card, the social image via next/og, and a test. No client
 * JavaScript is involved in drawing a cover, anywhere.
 *
 * Pure by design (CLAUDE.md).
 */

const W = 400

/**
 * `plate` is the library card (4:5), `cover` the standing book on a material
 * page (3:4). The landscape takes a little more of the taller cover, as it does
 * on the Latest Addition book, and leaves the card's head for its title.
 */
const FRAMES = {
  plate: { h: 500, land: 0.6 },
  cover: { h: 533, land: 0.52 },
} as const
export type Frame = keyof typeof FRAMES

export type CoverArt = { look: Look; seed: string; frame?: Frame }

/** One smooth ridge, closed down to the foot. */
function ridge(r: () => number, base: number, amp: number, steps: number, h: number): string {
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) pts.push([(W * i) / steps, base - amp * (0.3 + r() * 0.7)])
  let d = `M0,${pts[0][1].toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    const mx = ((x0 + x1) / 2).toFixed(1)
    d += ` C${mx},${y0.toFixed(1)} ${mx},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`
  }
  return `${d} L${W},${h} L0,${h} Z`
}

const path = (d: string, fill: string, opacity = 1) =>
  `<path d="${d}" fill="${fill}"${opacity < 1 ? ` opacity="${opacity}"` : ""}/>`

type Ctx = { r: () => number; s: Swatch; id: string; top: number; band: number; h: number }

/** A sun low over the hills, with its glow. `lift` raises it into the sky. */
function sun({ r, s, id, top, band }: Ctx, lift = 0, size = 1): string {
  const x = W * (0.2 + r() * 0.6)
  const y = top + band * (0.1 - lift)
  const rad = (15 + r() * 6) * size
  return (
    `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(rad * 2.8).toFixed(0)}" fill="url(#glow${id})"/>` +
    `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${rad.toFixed(1)}" fill="${s.sun}"/>`
  )
}

/**
 * The dark ground every cover stands on. High enough that the tagline on the
 * standing cover always sits on it, never across the edge of a hill.
 */
function ground({ r, s, top, band, h }: Ctx): string {
  return path(ridge(r, top + band * 0.83, band * 0.05, 3, h), s.hills[3])
}

const SCENE: Record<Scene, (c: Ctx) => string> = {
  valley: (c) => {
    const { r, s, top, band, h } = c
    return (
      sun(c) +
      path(ridge(r, top + band * 0.3, band * 0.14, 5, h), s.hills[0], 0.85) +
      path(ridge(r, top + band * 0.45, band * 0.13, 4, h), s.hills[1]) +
      path(ridge(r, top + band * 0.62, band * 0.12, 5, h), s.hills[2]) +
      path(ridge(r, top + band * 0.74, band * 0.05, 3, h), s.field) +
      ground(c)
    )
  },

  river: (c) => {
    const { r, s, top, band, h } = c
    const y = (f: number) => (top + band * f).toFixed(1)
    const bend = r() * 30 - 15
    const river =
      `M${W},${y(0.46)} C${W * 0.82},${y(0.48)} ${W * 0.7 + bend},${y(0.52)} ${W * 0.58},${y(0.58)}` +
      ` C${W * 0.48 + bend},${y(0.63)} ${W * 0.42},${y(0.68)} ${W * 0.36},${y(0.74)}` +
      ` C${W * 0.44},${y(0.73)} ${W * 0.53 + bend},${y(0.67)} ${W * 0.62},${y(0.61)}` +
      ` C${W * 0.73},${y(0.54)} ${W * 0.86},${y(0.51)} ${W},${y(0.5)} Z`
    return (
      sun(c) +
      path(ridge(r, top + band * 0.3, band * 0.14, 5, h), s.hills[0], 0.85) +
      path(
        `M${W * 0.35},${y(0.44)} C${W * 0.55},${y(0.34)} ${W * 0.78},${y(0.4)} ${W},${y(0.36)} L${W},${h} L${W * 0.35},${h} Z`,
        s.hills[1],
      ) +
      path(
        `M0,${y(0.42)} C${W * 0.16},${y(0.37)} ${W * 0.32},${y(0.42)} ${W * 0.5},${y(0.5)} L${W * 0.5},${h} L0,${h} Z`,
        s.hills[1],
      ) +
      path(river, s.water, 0.9) +
      path(
        `M0,${y(0.6)} C${W * 0.14},${y(0.53)} ${W * 0.3},${y(0.6)} ${W * 0.42},${y(0.7)} C${W * 0.5},${y(0.78)} ${W * 0.56},${y(0.88)} ${W * 0.58},${h} L0,${h} Z`,
        s.hills[2],
      ) +
      path(
        `M${W},${y(0.6)} C${W * 0.88},${y(0.6)} ${W * 0.78},${y(0.66)} ${W * 0.7},${y(0.75)} C${W * 0.65},${y(0.84)} ${W * 0.63},${y(0.93)} ${W * 0.62},${h} L${W},${h} Z`,
        s.hills[2],
      ) +
      ground(c)
    )
  },

  peak: (c) => {
    const { r, s, top, band, h } = c
    const px = W * (0.36 + r() * 0.28)
    const tip = top + band * (0.02 + r() * 0.06)
    const baseY = top + band * 0.52
    const half = W * (0.24 + r() * 0.08)
    // The lower peak behind stands to whichever side has more room.
    const side = px < W / 2 ? 1 : -1
    const bx = px + side * half * (0.85 + r() * 0.2)
    const btip = tip + band * (0.1 + r() * 0.06)
    const bhalf = half * 0.72
    const spur = px + half * 0.12
    const cap = tip + (baseY - tip) * 0.2
    return (
      sun(c, 0.12) +
      path(ridge(r, top + band * 0.4, band * 0.1, 5, h), s.hills[0], 0.8) +
      path(`M${bx - bhalf},${baseY} L${bx},${btip} L${bx + bhalf},${baseY} Z`, s.hills[0]) +
      path(`M${px - half},${baseY} L${px},${tip} L${spur},${baseY} Z`, s.hills[1]) +
      path(`M${px},${tip} L${px + half},${baseY} L${spur},${baseY} Z`, s.hills[2], 0.9) +
      path(
        `M${px},${tip} L${px - half * 0.2},${cap.toFixed(1)} L${px - half * 0.08},${(cap - 4).toFixed(1)} L${px + half * 0.02},${(cap + 3).toFixed(1)} L${px + half * 0.07},${(cap - 2).toFixed(1)} Z`,
        s.sky[1],
        0.9,
      ) +
      path(ridge(r, top + band * 0.66, band * 0.1, 5, h), s.hills[2]) +
      ground(c)
    )
  },

  dusk: (c) => {
    const { r, s, id, top, band, h } = c
    const x = W * (0.3 + r() * 0.4)
    const y = top + band * 0.34
    return (
      `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(band * 0.5).toFixed(0)}" fill="url(#glow${id})"/>` +
      `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(band * 0.1).toFixed(1)}" fill="${s.sun}"/>` +
      path(ridge(r, top + band * 0.42, band * 0.1, 4, h), s.hills[1]) +
      path(ridge(r, top + band * 0.6, band * 0.14, 4, h), s.hills[2]) +
      ground(c)
    )
  },

  lake: (c) => {
    const { r, s, top, band, h } = c
    const shore = top + band * 0.44
    const far = top + band * 0.74
    const sx = W * (0.3 + r() * 0.4)
    let glints = ""
    for (let i = 0; i < 5; i++) {
      const gy = shore + (far - shore) * (0.15 + i * 0.17)
      const gw = 70 - i * 11
      glints += `<path d="M${(sx - gw / 2).toFixed(0)},${gy.toFixed(1)} h${gw}" stroke="${s.sun}" stroke-width="1.6" stroke-linecap="round" opacity="${(0.7 - i * 0.12).toFixed(2)}"/>`
    }
    return (
      `<circle cx="${sx.toFixed(0)}" cy="${(top + band * 0.08).toFixed(0)}" r="42" fill="url(#glow${c.id})"/>` +
      `<circle cx="${sx.toFixed(0)}" cy="${(top + band * 0.08).toFixed(0)}" r="15" fill="${s.sun}"/>` +
      path(ridge(r, top + band * 0.3, band * 0.14, 5, h), s.hills[0], 0.85) +
      path(ridge(r, shore, band * 0.1, 4, h), s.hills[1]) +
      `<rect y="${shore.toFixed(1)}" width="${W}" height="${(far - shore).toFixed(1)}" fill="${s.water}" opacity=".8"/>` +
      glints +
      path(ridge(r, far + band * 0.04, band * 0.06, 4, h), s.hills[2]) +
      ground(c)
    )
  },

  moon: (c) => {
    const { r, s, top, band, h } = c
    const mx = W * (0.25 + r() * 0.5)
    const my = top + band * (0.07 + r() * 0.05)
    const mr = 15 + r() * 5
    const inner = mr * 0.74
    return (
      `<circle cx="${mx.toFixed(0)}" cy="${my.toFixed(0)}" r="${(mr * 3).toFixed(0)}" fill="url(#glow${c.id})" opacity=".7"/>` +
      `<path d="M${mx.toFixed(1)},${(my - mr).toFixed(1)} A${mr.toFixed(1)},${mr.toFixed(1)} 0 1,1 ${mx.toFixed(1)},${(my + mr).toFixed(1)} A${inner.toFixed(1)},${mr.toFixed(1)} 0 1,0 ${mx.toFixed(1)},${(my - mr).toFixed(1)} Z" fill="${s.sun}"/>` +
      path(ridge(r, top + band * 0.34, band * 0.14, 5, h), s.hills[0], 0.8) +
      path(ridge(r, top + band * 0.5, band * 0.13, 4, h), s.hills[1]) +
      path(ridge(r, top + band * 0.68, band * 0.12, 5, h), s.hills[2]) +
      ground(c)
    )
  },

  field: (c) => {
    const { r, s, id, top, band, h } = c
    const fieldTop = top + band * 0.4
    let rows = ""
    for (let i = 0; i < 5; i++) {
      const y = fieldTop + band * (0.07 + i * 0.075)
      rows += `<path d="M0,${(y + 4).toFixed(1)} Q${W / 2},${(y - 6).toFixed(1)} ${W},${(y + 4).toFixed(1)}" stroke="${s.hills[3]}" stroke-width="1.2" fill="none" opacity=".22"/>`
    }
    return (
      sun(c) +
      path(ridge(r, top + band * 0.3, band * 0.12, 5, h), s.hills[0], 0.85) +
      path(ridge(r, fieldTop, band * 0.06, 4, h), `url(#field${id})`) +
      rows +
      path(ridge(r, top + band * 0.8, band * 0.06, 4, h), s.hills[2]) +
      ground(c)
    )
  },

  hills: (c) => {
    const { r, s, top, band, h } = c
    const y = (f: number) => (top + band * f).toFixed(1)
    const a = r() * 20
    return (
      sun(c) +
      path(ridge(r, top + band * 0.32, band * 0.1, 4, h), s.hills[0], 0.8) +
      path(
        `M0,${y(0.5)} C${W * 0.2},${y(0.3)} ${W * 0.45 + a},${y(0.3)} ${W * 0.62},${y(0.52)} L${W * 0.62},${h} L0,${h} Z`,
        s.hills[1],
      ) +
      path(
        `M${W * 0.4},${y(0.62)} C${W * 0.6},${y(0.4)} ${W * 0.85 - a},${y(0.42)} ${W},${y(0.52)} L${W},${h} L${W * 0.4},${h} Z`,
        s.hills[2],
      ) +
      path(
        `M0,${y(0.74)} C${W * 0.25},${y(0.6)} ${W * 0.5},${y(0.66)} ${W * 0.7},${y(0.8)} L${W * 0.7},${h} L0,${h} Z`,
        s.hills[2],
      ) +
      ground(c)
    )
  },
}

export function coverArt({ look, seed, frame = "plate" }: CoverArt): string {
  const { h, land } = FRAMES[frame]
  const r = rng(hash(`${seed}:${frame}`))
  const id = uid(seed + look.scene + frame)
  const s = look.swatch
  const top = h * land
  const band = h - top
  const ctx: Ctx = { r, s, id, top, band, h }

  // The sky: the swatch's head colour, easing to its middle behind the type,
  // then warming at the horizon as the Latest Addition cover does.
  const horizon = ((top - band * 0.08) / h).toFixed(3)
  const warmth = Math.min(0.99, (top + band * 0.2) / h).toFixed(3)

  return (
    `<svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><defs>` +
    `<linearGradient id="sky${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.sky[0]}"/><stop offset="${horizon}" stop-color="${s.sky[1]}"/><stop offset="${warmth}" stop-color="${s.sky[2]}"/><stop offset="1" stop-color="${s.sky[2]}"/></linearGradient>` +
    `<radialGradient id="glow${id}"><stop offset="0" stop-color="${s.glow}" stop-opacity=".9"/><stop offset=".45" stop-color="${s.glow}" stop-opacity=".35"/><stop offset="1" stop-color="${s.glow}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="field${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.field}" stop-opacity=".75"/><stop offset="1" stop-color="${s.field}"/></linearGradient>` +
    `</defs>` +
    `<rect width="${W}" height="${h}" fill="url(#sky${id})"/>` +
    SCENE[look.scene](ctx) +
    `</svg>`
  )
}
