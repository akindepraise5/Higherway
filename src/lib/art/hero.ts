import { hash, rng } from "./seed"

/**
 * The scene behind the home page headline. One fixed drawing rather than a
 * seeded one — it is the archive's own face, so it should not change.
 *
 * Layered ridges at dusk, a low sun, and haze. Deliberately more elaborate than
 * a cover: a cover competes with its title, this sits behind two lines of text
 * and carries the page on its own.
 *
 * Pure by design (CLAUDE.md).
 */

const W = 1440
const H = 760

function ridge(r: () => number, base: number, amp: number, steps: number): string {
  const points: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    points.push([(W * i) / steps, base - amp * (0.28 + r() * 0.72)])
  }

  let d = `M0,${points[0][1].toFixed(1)}`
  for (let i = 1; i < points.length; i++) {
    d += ` L${points[i][0].toFixed(1)},${points[i][1].toFixed(1)}`
  }
  return `${d} L${W},${H} L0,${H} Z`
}

export function heroArt(): string {
  const r = rng(hash("higherway-hero"))

  let body = `<rect width="${W}" height="${H}" fill="url(#heroSky)"/>`

  // Haze bands across the horizon, faint enough to read as light not stripes.
  for (let i = 0; i < 5; i++) {
    const y = H * (0.3 + i * 0.055)
    body += `<rect y="${y.toFixed(0)}" width="${W}" height="${(6 + r() * 16).toFixed(0)}" fill="#FFE9C0" opacity="${(0.05 + r() * 0.06).toFixed(3)}"/>`
  }

  body += `<circle cx="${(W * 0.68).toFixed(0)}" cy="${(H * 0.42).toFixed(0)}" r="280" fill="url(#heroGlow)"/>`
  body += `<circle cx="${(W * 0.68).toFixed(0)}" cy="${(H * 0.42).toFixed(0)}" r="54" fill="url(#heroDisc)"/>`
  body += `<rect y="${(H * 0.5).toFixed(0)}" width="${W}" height="${(H * 0.22).toFixed(0)}" fill="url(#heroHaze)"/>`

  body += `<path d="${ridge(r, H * 0.6, 150, 7)}" fill="#8A9490" opacity=".42"/>`
  body += `<path d="${ridge(r, H * 0.72, 140, 6)}" fill="#46524D" opacity=".92"/>`
  body += `<path d="${ridge(r, H * 0.86, 120, 5)}" fill="#2A342F"/>`
  body += `<path d="${ridge(r, H * 1.02, 92, 4)}" fill="#161D19"/>`

  return (
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><defs>` +
    `<linearGradient id="heroSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22323A"/><stop offset=".34" stop-color="#5E7076"/><stop offset=".62" stop-color="#C69C6A"/><stop offset="1" stop-color="#F7DCA8"/></linearGradient>` +
    `<radialGradient id="heroGlow"><stop offset="0" stop-color="#FFEFCC" stop-opacity=".85"/><stop offset=".35" stop-color="#FFDFA8" stop-opacity=".38"/><stop offset="1" stop-color="#FFDFA8" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="heroDisc"><stop offset="0" stop-color="#FFFBF0"/><stop offset=".72" stop-color="#FFF4DC" stop-opacity=".92"/><stop offset="1" stop-color="#FFF0CE" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="heroHaze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE3B0" stop-opacity="0"/><stop offset="1" stop-color="#FFDCA4" stop-opacity=".30"/></linearGradient>` +
    `</defs>${body}</svg>`
  )
}
