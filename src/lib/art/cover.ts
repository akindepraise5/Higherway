import type { Motif, Palette } from "./palette"
import { hash, rng, uid } from "./seed"

/**
 * The drawing behind every title.
 *
 * Three moves and no more: a wash in the topic's colour, one simple mark, and
 * the land. The title is meant to be the loudest thing on a cover, so the
 * picture behind it stays quiet — this is a publication, not a poster.
 *
 * Returns an SVG string rather than a component, so the same artwork serves a
 * server-rendered card, a social image via next/og, and a test. No client
 * JavaScript is involved in drawing a cover, anywhere.
 *
 * Pure by design (CLAUDE.md).
 */

const W = 400
const H = 500

export type CoverArt = { motif: Motif; palette: Palette; seed: string }

/** One smooth curve for the land. No jagged ranges, no layered detail. */
function softLand(r: () => number, base: number, amp: number): string {
  const y0 = base - amp * r()
  const y1 = base - amp * r()
  const y2 = base - amp * r()
  return (
    `M0,${y0.toFixed(1)}` +
    ` C${(W * 0.3).toFixed(0)},${y1.toFixed(1)} ${(W * 0.66).toFixed(0)},${y2.toFixed(1)} ${W},${((y0 + y2) / 2).toFixed(1)}` +
    ` L${W},${H} L0,${H} Z`
  )
}

function mark(
  motif: Motif,
  r: () => number,
  p: Palette,
  id: string,
  mx: number,
  my: number,
  hz: number,
): string {
  switch (motif) {
    case "moon": {
      const mr = 20 + r() * 14
      const inner = mr * 0.76
      return `<path d="M${mx.toFixed(1)},${(my - mr).toFixed(1)} A${mr.toFixed(1)},${mr.toFixed(1)} 0 1,1 ${mx.toFixed(1)},${(my + mr).toFixed(1)} A${inner.toFixed(1)},${mr.toFixed(1)} 0 1,0 ${mx.toFixed(1)},${(my - mr).toFixed(1)} Z" fill="${p.sun}" opacity=".66"/>`
    }
    case "arc": {
      const ar = W * (0.32 + r() * 0.18)
      return `<path d="M${(mx - ar).toFixed(0)},${(my + 34).toFixed(0)} A${ar.toFixed(0)},${(ar * 0.66).toFixed(0)} 0 0,1 ${(mx + ar).toFixed(0)},${(my + 34).toFixed(0)}" fill="none" stroke="${p.sun}" stroke-width="2.6" opacity=".52"/>`
    }
    case "rings": {
      const rr = 26 + r() * 18
      return [0, 1, 2]
        .map(
          (i) =>
            `<circle cx="${mx.toFixed(0)}" cy="${my.toFixed(0)}" r="${(rr * (1 + i * 0.44)).toFixed(0)}" fill="none" stroke="${p.sun}" stroke-width="2" opacity="${(0.46 - i * 0.13).toFixed(2)}"/>`,
        )
        .join("")
    }
    case "dot": {
      return (
        `<path d="M0,${my.toFixed(0)} H${W}" stroke="${p.sun}" stroke-width="1.2" opacity=".24"/>` +
        `<circle cx="${mx.toFixed(0)}" cy="${my.toFixed(0)}" r="${(10 + r() * 8).toFixed(0)}" fill="${p.sun}" opacity=".76"/>`
      )
    }
    case "bars": {
      const bw = W * (0.34 + r() * 0.16)
      const lean = r() > 0.5 ? 1 : -1
      return [0, 1, 2]
        .map((i) => {
          const w = bw * (1 - i * 0.28)
          const by = my + i * 30
          const x = mx - bw / 2 + (lean > 0 ? 0 : bw - w)
          return `<path d="M${x.toFixed(0)},${by.toFixed(0)} h${w.toFixed(0)}" stroke="${p.sun}" stroke-width="3" stroke-linecap="round" opacity="${(0.58 - i * 0.14).toFixed(2)}"/>`
        })
        .join("")
    }
    case "halo": {
      const rr = 24 + r() * 14
      return (
        `<circle cx="${mx.toFixed(0)}" cy="${my.toFixed(0)}" r="${(rr * 2.1).toFixed(0)}" fill="url(#glow${id})"/>` +
        `<circle cx="${mx.toFixed(0)}" cy="${my.toFixed(0)}" r="${(rr * 1.7).toFixed(0)}" fill="none" stroke="${p.sun}" stroke-width="1.8" opacity=".40"/>`
      )
    }
    default:
      // sun, and the low light a peak is drawn against
      return `<circle cx="${mx.toFixed(0)}" cy="${(hz - 28 - r() * 38).toFixed(0)}" r="${(34 + r() * 24).toFixed(0)}" fill="url(#glow${id})"/>`
  }
}

export function coverArt({ motif, palette, seed }: CoverArt): string {
  const r = rng(hash(seed))
  const id = uid(seed + motif)

  const hz = H * (0.56 + r() * 0.16) // where the land begins
  const mx = W * (0.26 + r() * 0.48) // where the mark sits
  const my = hz - 96 - r() * 76

  let land = ""
  if (motif === "peak") {
    const pw = W * (0.26 + r() * 0.16)
    const ph = 58 + r() * 48
    land += `<path d="M${mx.toFixed(0)},${(hz - ph).toFixed(0)} L${(mx + pw).toFixed(0)},${(hz + 6).toFixed(0)} L${(mx - pw).toFixed(0)},${(hz + 6).toFixed(0)} Z" fill="${palette.ridges[4]}"/>`
  }
  land += `<path d="${softLand(r, hz, 48)}" fill="${palette.ridges[3]}"/>`

  return (
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><defs>` +
    `<linearGradient id="sky${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${palette.sky[0]}"/><stop offset=".58" stop-color="${palette.sky[1]}"/><stop offset="1" stop-color="${palette.sky[2]}"/></linearGradient>` +
    `<radialGradient id="glow${id}"><stop offset="0" stop-color="${palette.sun}"/><stop offset=".45" stop-color="${palette.sun}" stop-opacity=".55"/><stop offset="1" stop-color="${palette.sun}" stop-opacity="0"/></radialGradient>` +
    `</defs>` +
    `<rect width="${W}" height="${H}" fill="url(#sky${id})"/>` +
    mark(motif, r, palette, id, mx, my, hz) +
    land +
    `</svg>`
  )
}
