/**
 * The Higherway logo.
 *
 * A small, shallow arc centred above the word — not a span from the H to the W.
 * The proportions come straight from v1's cover mark, where the arc is about
 * 1.4× the word's font size wide and 0.4× tall, sitting just above it. It reads
 * as a rise the word sits under, which is the idea behind the name.
 *
 * Drawn as one SVG with the word as a `<text>` element, so the relationship
 * holds at every size. An arc and a heading laid out separately drift apart the
 * moment either is rescaled.
 *
 * Inline rather than a file: it is drawn at half a dozen sizes across the site
 * and should never cost a network request.
 */

export const LOGO_VIEWBOX = "0 0 200 74"

/**
 * The curve, scaled from v1's `M2 9.2C5 3.6 11 1 18 1s13 2.6 16 8.2` and
 * centred on x=100. Shallow and wide relative to its height, with round caps.
 */
export const LOGO_ARC_PATH = "M73.3 17.9C78.3 9.4 88.3 5.5 100 5.5s21.7 3.9 26.7 12.4"

type Props = {
  className?: string
  /** Hide from assistive tech when a visible label sits beside it. */
  decorative?: boolean
}

export function Logo({ className = "", decorative = false }: Props) {
  return (
    <svg
      viewBox={LOGO_VIEWBOX}
      className={className}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : "Higherway"}
      focusable="false"
    >
      {decorative ? null : <title>Higherway</title>}
      <path
        d={LOGO_ARC_PATH}
        fill="none"
        stroke="currentColor"
        className="text-gold-2"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <text
        x="100"
        y="66"
        textAnchor="middle"
        className="font-serif"
        fontSize="44"
        fontWeight="400"
        letterSpacing="-0.8"
        fill="currentColor"
      >
        Higherway
      </text>
    </svg>
  )
}

/**
 * The arc on its own — for covers, where the word is already set in type
 * beneath it at a size the lockup cannot match.
 */
export function Arc({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 11" className={className} aria-hidden="true" focusable="false">
      <path
        d="M2 9.2C5 3.6 11 1 18 1s13 2.6 16 8.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}
