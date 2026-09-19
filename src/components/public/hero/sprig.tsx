import type { CSSProperties } from "react"

/**
 * A sprig of leaves, tucked behind the books in the hero. Drawn, not
 * photographed, so it stays sharp at any size and costs a few hundred bytes.
 *
 * Leaves alternate along a curved stem and shrink towards the tip. Position
 * and size come from the caller's className, and its angle — at rest and when
 * the books gather — from `style`, so each sprig in the hero is the same
 * drawing turned a different way.
 */

const LEAVES = [
  { t: 0.9, side: -1, size: 1 },
  { t: 0.76, side: 1, size: 0.96 },
  { t: 0.6, side: -1, size: 0.9 },
  { t: 0.45, side: 1, size: 0.82 },
  { t: 0.3, side: -1, size: 0.72 },
  { t: 0.16, side: 1, size: 0.6 },
  { t: 0.03, side: 0, size: 0.5 },
] as const

/** A point along the stem, from its foot (t = 1) to its tip (t = 0). */
function onStem(t: number): [number, number] {
  // Quadratic curve: foot (58, 236) → control (40, 120) → tip (74, 12)
  const x = (1 - t) ** 2 * 74 + 2 * (1 - t) * t * 40 + t ** 2 * 58
  const y = (1 - t) ** 2 * 12 + 2 * (1 - t) * t * 120 + t ** 2 * 236
  return [x, y]
}

/**
 * Two greens: `forest` for the hero, where the leaves sit against mist, and
 * `sage` for paper, where forest would read as a dark blot.
 */
const TONES = {
  forest: { from: "#23332A", to: "#4B6148", stem: "#2C3B31", vein: "#6E8367" },
  sage: { from: "#7F8C71", to: "#AEB79A", stem: "#76826A", vein: "#C9D0B8" },
} as const

export function Sprig({
  className = "",
  style,
  tone = "forest",
}: {
  className?: string
  style?: CSSProperties
  tone?: keyof typeof TONES
}) {
  const c = TONES[tone]
  // One gradient id per tone: two tones on a page must not share one, or the
  // second sprig silently takes the first one's colours.
  const leafId = `sprigLeaf-${tone}`
  return (
    <svg
      viewBox="0 0 130 240"
      className={`pointer-events-none absolute ${className}`}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={leafId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={c.from} />
          <stop offset="1" stopColor={c.to} />
        </linearGradient>
      </defs>
      <path
        d="M58 236 Q40 120 74 12"
        fill="none"
        stroke={c.stem}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {LEAVES.map((leaf) => {
        const [x, y] = onStem(leaf.t)
        const angle = leaf.side === 0 ? -80 : leaf.side < 0 ? -150 : -30
        const len = 50 * leaf.size
        return (
          <g
            key={leaf.t}
            transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle}) scale(${(len / 50).toFixed(2)})`}
          >
            <path d="M0 0 C12 -12 36 -12 50 0 C36 12 12 12 0 0 Z" fill={`url(#${leafId})`} />
            <path d="M2 0 L46 0" stroke={c.vein} strokeWidth="0.9" opacity=".55" />
          </g>
        )
      })}
    </svg>
  )
}
