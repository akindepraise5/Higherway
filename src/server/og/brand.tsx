import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { LOGO_ARC_PATH } from "../../components/public/logo"

/**
 * The logo, drawn for a social image.
 *
 * Three surfaces render a mark into an `ImageResponse` — the material's share
 * picture, the default share picture and the iOS home-screen icon — and before
 * this they drew three different things. The material one was not the logo at
 * all: a gold dash beside "HIGHERWAY" set in uppercase sans. The other two had
 * an arc over the word, but a deeper arc than the real one and set in whatever
 * face the renderer defaulted to.
 *
 * So the geometry comes from `components/public/logo.tsx` itself, and the word
 * is set in Newsreader, which is what the site sets it in everywhere else.
 *
 * **Why the word is not part of the SVG.** Satori draws inline SVG shapes, but
 * a `<text>` node inside one is laid out by the renderer beneath it, which has
 * no font for it. The arc is therefore an SVG path and the word is a real text
 * node in the Satori tree, stacked — the same split the site does not need,
 * because a browser has the font.
 */

/**
 * The arc alone, cropped out of the logo's own 200×74 viewBox.
 *
 * `LOGO_ARC_PATH` spans x 73.3–126.7 and y 5.5–17.9 in that space, and the
 * stroke overhangs it by half its width on every side. Two units of margin on
 * each side is that overhang plus a hair, so the curve is never shaved by the
 * edge of its own box.
 */
const ARC_VIEWBOX = "71.3 3.5 57.4 16.4"

/**
 * Multiples of the word's font size, taken from the lockup in `logo.tsx` and
 * then checked against a screenshot of the real one rather than reasoned about.
 *
 * `ARC_WIDTH` is the **viewBox** width, not the path's span. The path runs
 * 73.3–126.7 — 53.4 units — but a 4-unit stroke overhangs it by 2 on each side,
 * so the box it has to be drawn into is 57.4. Sizing the element to 53.4
 * squeezed the whole thing, path and stroke, into that width: the arc came out
 * 0.263 of the word where the real mark is 0.290.
 */
const ARC_WIDTH = 57.4 / 44
const ARC_ASPECT = 16.4 / 57.4

/**
 * The space between the bottom of the arc and the top of the word.
 *
 * Measured off the real logo as drawn by a browser: 0.0746 of the word's width,
 * which at this face's 4.47 width-to-font-size ratio is 0.296 of the font
 * size. It cannot be read off `logo.tsx`, where the arc and the word share one
 * coordinate space — here the word is a text node whose ascender is empty space
 * the arc has to clear. Left to itself, the arc landed *on* the capitals.
 */
const ARC_GAP = 0.296

/**
 * Both faces, read from the repository rather than fetched.
 *
 * `next/font` puts a woff2 in the build, which Satori cannot read, and the
 * Google Fonts API is a network call the build would then depend on — a
 * prerendered social image that fails when fonts.googleapis.com is slow is a
 * broken build for no reason. The two latin subsets are 107 KB and 48 KB, so
 * they are simply kept in `assets/`.
 *
 * **Both, not just the serif.** Satori falls back to the first font it was
 * given for anything without an explicit family, so handing it Newsreader alone
 * set the topic label and the strapline in the serif too — surfaces the site
 * sets in Instrument Sans. `SANS` is listed first so it is the default, and the
 * serif is asked for by name where it belongs.
 *
 * Read once per process: three routes render with them and one serverless
 * instance can serve many requests.
 */
export const SANS = "Instrument Sans"
export const SERIF = "Newsreader"

const FILES: Record<string, string> = {
  [SANS]: "InstrumentSans-Regular.ttf",
  [SERIF]: "Newsreader-Regular.ttf",
}

const cached = new Map<string, Promise<Buffer>>()

function face(name: string): Promise<Buffer> {
  const existing = cached.get(name)
  if (existing) return existing
  const loading = readFile(join(process.cwd(), "assets", FILES[name] as string))
  cached.set(name, loading)
  return loading
}

/** What `ImageResponse` wants. Sans first, so it is what anything unset gets. */
export async function ogFonts() {
  const [sans, serif] = await Promise.all([face(SANS), face(SERIF)])
  return [
    { name: SANS, data: sans, style: "normal" as const, weight: 400 as const },
    { name: SERIF, data: serif, style: "normal" as const, weight: 400 as const },
  ]
}

/**
 * The lockup: the arc centred above the word, at whatever size is asked for.
 *
 * Every measurement is a multiple of `size`, so the relationship between arc
 * and word holds from a 180px icon to a 1200px card — which is the same reason
 * the site's own logo is one SVG rather than an image beside a heading.
 */
export function Wordmark({
  size,
  color = "#F5F1EA",
  arcColor = "#d8b25f",
}: {
  /** Font size of the word. Everything else is derived from it. */
  size: number
  color?: string
  arcColor?: string
}) {
  const arcWidth = size * ARC_WIDTH

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <svg
        width={arcWidth}
        height={arcWidth * ARC_ASPECT}
        viewBox={ARC_VIEWBOX}
        fill="none"
        aria-hidden="true"
      >
        {/* In viewBox units, so it is the logo's own stroke width and scales
            with the box rather than with the rendered pixel size. */}
        <path d={LOGO_ARC_PATH} stroke={arcColor} strokeWidth={4} strokeLinecap="round" />
      </svg>

      <div
        style={{
          display: "flex",
          fontFamily: SERIF,
          fontSize: size,
          lineHeight: 1,
          marginTop: size * ARC_GAP,
          letterSpacing: -size * 0.018,
          color,
        }}
      >
        Higherway
      </div>
    </div>
  )
}
