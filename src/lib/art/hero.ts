import { hash, rng } from "./seed"

/**
 * The scene behind the home page headline. One fixed drawing rather than a
 * seeded one — it is the archive's own face, so it should not change.
 *
 * A misty morning: a cream sky with a pale sun high on the right, and soft
 * ridges receding through haze, deepening to forest at the foot. The upper
 * left stays light on purpose — the headline is set there in ink, and the
 * ground is dark only below the buttons. A second veil of mist lies over the far
 * ridges behind the text column, so the paragraph never sits on a hill line.
 *
 * Drawn with `xMidYMax slice`, so however the hero is shaped the forest stays
 * anchored to its foot and the sky to its head.
 *
 * Pure by design (CLAUDE.md).
 */

const W = 1600
const H = 900

/** One smooth ridge line, closed down to the bottom edge. */
function ridge(r: () => number, base: number, amp: number, steps: number): string {
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    pts.push([(W * i) / steps, base - amp * (0.3 + r() * 0.7)])
  }

  let d = `M0,${pts[0][1].toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    const mx = ((x0 + x1) / 2).toFixed(1)
    d += ` C${mx},${y0.toFixed(1)} ${mx},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`
  }
  return `${d} L${W},${H} L0,${H} Z`
}

/** Far to near: where the ridge sits, how high it rises, and its colour. */
const LAYERS = [
  { base: 0.66, amp: 50, steps: 6, fill: "#DAD7C8", opacity: 0.4 },
  { base: 0.72, amp: 65, steps: 5, fill: "#CBCBBC", opacity: 0.5 },
  { base: 0.78, amp: 80, steps: 6, fill: "#B1B5A5", opacity: 0.66 },
  { base: 0.84, amp: 85, steps: 5, fill: "#848D7D", opacity: 0.86 },
  { base: 0.9, amp: 80, steps: 6, fill: "#525E52", opacity: 1 },
  { base: 0.96, amp: 65, steps: 4, fill: "#2E3A31", opacity: 1 },
  { base: 1.03, amp: 45, steps: 3, fill: "#1A231E", opacity: 1 },
] as const

export function heroArt(): string {
  const r = rng(hash("higherway-hero-morning"))

  let body = `<rect width="${W}" height="${H}" fill="url(#heroSky)"/>`

  // Light where the headline sits, and the sun's warmth where it rises.
  body += `<ellipse cx="${W * 0.26}" cy="${H * 0.3}" rx="${W * 0.5}" ry="${H * 0.42}" fill="url(#heroWash)"/>`
  body += `<circle cx="${W * 0.84}" cy="${H * 0.15}" r="${H * 0.52}" fill="url(#heroGlow)"/>`
  body += `<circle cx="${W * 0.84}" cy="${H * 0.15}" r="${H * 0.11}" fill="url(#heroDisc)"/>`

  // Each ridge, with a band of haze lying over the one behind it.
  LAYERS.forEach((l, i) => {
    body += `<path d="${ridge(r, H * l.base, l.amp, l.steps)}" fill="${l.fill}" opacity="${l.opacity}"/>`
    if (i === 2) {
      body += `<ellipse cx="${W * 0.24}" cy="${H * 0.56}" rx="${W * 0.36}" ry="${H * 0.26}" fill="url(#heroWash)"/>`
    }
    if (i < 4) {
      const y = H * (l.base - 0.02)
      body += `<rect y="${y.toFixed(0)}" width="${W}" height="${(H * 0.1).toFixed(0)}" fill="url(#heroMist)" opacity="${(0.55 - i * 0.1).toFixed(2)}"/>`
    }
  })

  return (
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><defs>` +
    `<linearGradient id="heroSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EEE6D4"/><stop offset=".38" stop-color="#E7DFCC"/><stop offset=".6" stop-color="#D2D0BF"/><stop offset="1" stop-color="#A9AE9E"/></linearGradient>` +
    `<radialGradient id="heroWash"><stop offset="0" stop-color="#F5EFE3" stop-opacity=".85"/><stop offset=".6" stop-color="#F2EBDD" stop-opacity=".35"/><stop offset="1" stop-color="#F2EBDD" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="heroGlow"><stop offset="0" stop-color="#FFF2D2" stop-opacity=".9"/><stop offset=".4" stop-color="#F6E3B8" stop-opacity=".35"/><stop offset="1" stop-color="#F6E3B8" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="heroDisc"><stop offset="0" stop-color="#FBEFD2"/><stop offset=".78" stop-color="#F7E6C0" stop-opacity=".9"/><stop offset="1" stop-color="#F7E6C0" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="heroMist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F1ECE0" stop-opacity="0"/><stop offset=".55" stop-color="#EFE9DC" stop-opacity=".7"/><stop offset="1" stop-color="#EFE9DC" stop-opacity="0"/></linearGradient>` +
    `</defs>${body}</svg>`
  )
}
