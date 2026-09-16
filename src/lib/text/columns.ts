/**
 * Putting OCR'd lines back into reading order.
 *
 * macOS Vision returns each recognised line with a bounding box, in roughly
 * raster order — top to bottom, left to right *across the whole page*. On a
 * two-column magazine spread that alternates between the columns, so joining
 * the lines in the order they arrive produces text like:
 *
 *   orn into a Muslim family, I was trained
 *   Not wanting to keep the joy of the Lord to myself,
 *   from my youth to practice the Muslim        By Silas Ajibade
 *
 * — two unrelated sentences woven together. Every page of this archive is a
 * photograph of a printed magazine, so this is the common case, not an edge.
 *
 * The geometry is enough to fix it. Two things had to be learnt the hard way on
 * a real page, and both are why this looks more careful than it might:
 *
 *  1. The gutter is measured **once for the whole page**, not per band. A page
 *     has a handful of wide lines — a headline, a standfirst, the occasional
 *     line Vision merges straight across the gap — and any one of them will
 *     close the gutter in a small group. Across the whole page the narrow
 *     lines outvote them comfortably.
 *  2. A line counts as spanning when it **crosses that gutter**, not when it is
 *     wider than some guessed fraction of the page. A width threshold has to be
 *     picked, and whatever is picked is wrong for a layout with wider or
 *     narrower columns. Crossing the gap is the thing that actually matters.
 *
 * Pure, so the awkward layouts can be tested without a Mac or an image.
 * Coordinates follow Vision's convention: normalised 0–1, origin bottom-left.
 */

export type TextBox = {
  text: string
  confidence: number
  x: number
  y: number
  width: number
  height: number
}

/** Slices across the page width used to measure where the text sits. */
const BINS = 200

/**
 * How wide the *measured* gap must be — which is far less than the printed one.
 *
 * On a real two-column page from this archive, coverage sits at ~42 lines
 * across the page, collapses to 6 at x=0.50, and is back to 42 a single bin
 * later. The printed gutter is several percent of the page, but OCR bounding
 * boxes overshoot into it from both sides: left-column boxes reach 0.49 and
 * right-column boxes begin at 0.505. Requiring a wide gap rejected a gutter
 * that was plainly there.
 *
 * What identifies a gutter is the *depth* of the drop, not its width, and
 * `quiet` below is what measures that. This only rules out a gap of nothing.
 */
const MIN_GUTTER = 0.005

/** Gutters only count in the middle of the page; margins are not columns. */
const EDGE_MARGIN = 0.12

/**
 * How far into *both* columns a line must reach before it counts as spanning.
 *
 * Generous on purpose. A byline is often set into the gap between the columns
 * — "By Silas Ajibade" sits at x=0.44 and is 0.12 wide, straddling the gutter
 * without belonging to either side. With a small margin it reads as a spanning
 * line and breaks the opening paragraph into fragments, which interleaves the
 * very lines this is meant to separate.
 *
 * A line that genuinely runs across the page reaches much further: the headline
 * overlaps each column by about a third of the page, the byline by 0.06.
 */
const CROSSING = 0.1

const topOf = (box: TextBox) => 1 - (box.y + box.height)
const centreOf = (box: TextBox) => box.x + box.width / 2

/**
 * Where the columns are divided.
 *
 * A gutter is where *almost* nothing sits rather than where nothing does: on a
 * real page from this archive, 104 of 106 lines sat neatly in two columns while
 * one line Vision had merged spanned 0.06→0.93 and hid the gap completely. An
 * inset byline sitting in the gutter would do the same.
 */
function gutters(boxes: TextBox[]): number[] {
  if (boxes.length < 4) return []

  /**
   * Headlines and standfirsts are excluded from the vote outright. Relying on
   * them being outnumbered only works when there are many body lines: on a real
   * page 102 narrow lines drown out 4 wide ones, but in any small group two
   * wide lines are enough to close the gutter and collapse the page to one
   * column. Width relative to the median is what separates them, because it
   * needs no assumption about how wide a column is.
   */
  const widths = boxes.map((b) => b.width).sort((a, b) => a - b)
  const median = widths[Math.floor(widths.length / 2)] ?? 0
  const body = boxes.filter((b) => b.width <= median * 1.2)
  if (body.length < 3) return []

  const coverage = new Array<number>(BINS).fill(0)
  for (const box of body) {
    const from = Math.max(0, Math.floor(box.x * BINS))
    const to = Math.min(BINS - 1, Math.ceil((box.x + box.width) * BINS) - 1)
    for (let bin = from; bin <= to; bin++) coverage[bin] = (coverage[bin] ?? 0) + 1
  }

  const peak = Math.max(...coverage)
  if (peak === 0) return []
  /**
   * Quiet, not empty — a byline set into the gap would otherwise fill it. The
   * floor of 2 keeps that from mattering; the fraction keeps a genuinely short
   * column (ten lines against fifty) from being mistaken for a gap.
   */
  const quiet = Math.max(2, peak * 0.15)

  const found: number[] = []
  let runStart: number | null = null

  for (let bin = 0; bin <= BINS; bin++) {
    const isQuiet = bin < BINS && (coverage[bin] ?? 0) < quiet

    if (isQuiet && runStart === null) runStart = bin
    if (!isQuiet && runStart !== null) {
      const width = (bin - runStart) / BINS
      const middle = (runStart + bin) / 2 / BINS
      if (width >= MIN_GUTTER && middle > EDGE_MARGIN && middle < 1 - EDGE_MARGIN) {
        found.push(middle)
      }
      runStart = null
    }
  }

  return found
}

const crosses = (box: TextBox, gutter: number) =>
  box.x < gutter - CROSSING && box.x + box.width > gutter + CROSSING

/**
 * Prefixes that keep their hyphen when a word breaks across a line.
 *
 * "self-" followed by "denial" is a hyphenated word that happened to wrap, not
 * a word split by the typesetter — and this archive has a material called
 * "Exploring the word Self denial", so it is not hypothetical. Everything else
 * rejoins without the hyphen.
 */
const KEEPS_HYPHEN = new Set([
  "self",
  "non",
  "pre",
  "re",
  "anti",
  "co",
  "ex",
  "half",
  "well",
  "cross",
])

/**
 * Put words back together when the printer broke them across a line.
 *
 * A column of justified type is full of these: "admis-" / "sion", "sur-" /
 * "prise", "scholar-" / "ship". Left split, the word is not just ugly — it
 * cannot be searched for, which defeats the reason the text is public at all
 * (ARCHITECTURE.md §7). Only joins when the next line starts lower-case, so a
 * dash ending a sentence does not swallow the line after it.
 */
function joinHyphenated(lines: string[]): string[] {
  const out: string[] = []

  for (const line of lines) {
    const previous = out[out.length - 1]

    if (previous !== undefined && /\w[-–]$/.test(previous) && /^[a-z]/.test(line)) {
      const stem = previous.slice(0, -1)
      const lastWord = stem.split(/\s+/).pop()?.toLowerCase() ?? ""
      out[out.length - 1] = KEEPS_HYPHEN.has(lastWord) ? `${stem}-${line}` : stem + line
      continue
    }

    out.push(line)
  }

  return out
}

/**
 * Vision reads a drop cap as its own one-character line, leaving the paragraph
 * beginning "orn into a Muslim family". Rejoin them.
 */
function mergeDropCaps(lines: string[]): string[] {
  const out: string[] = []

  for (const line of lines) {
    const previous = out[out.length - 1]
    const isDropCap = previous !== undefined && /^[A-Z]$/.test(previous.trim())

    if (isDropCap && /^[a-z]/.test(line)) {
      out[out.length - 1] = previous.trim() + line
      continue
    }
    out.push(line)
  }

  return out
}

/** One band of text, read column by column. */
function orderBand(band: TextBox[], splits: number[]): string[] {
  if (splits.length === 0) {
    return [...band].sort((a, b) => topOf(a) - topOf(b)).map((b) => b.text)
  }

  const bounds = [0, ...splits, 1]
  const columns: TextBox[][] = bounds.slice(0, -1).map(() => [])

  for (const box of band) {
    const centre = centreOf(box)
    let index = columns.length - 1
    for (let i = 1; i < bounds.length; i++) {
      if (centre <= (bounds[i] ?? 1)) {
        index = i - 1
        break
      }
    }
    columns[index]?.push(box)
  }

  return columns.flatMap((column) =>
    [...column].sort((a, b) => topOf(a) - topOf(b)).map((b) => b.text),
  )
}

/**
 * How much of the text block a crossing line must cover to be one Vision merged
 * across the gutter, rather than a heading that genuinely spans the page.
 *
 * Height cannot tell these apart, which was worth measuring before assuming:
 * the merged line on a real page is 1.17× the median line height, *shorter*
 * than ordinary body lines at 1.20× to 1.34×. Only the headline stands out, at
 * 2.79×.
 *
 * Span does separate them. A merged line runs the full width of the text block
 * — 0.06 to 0.93, both columns end to end — while the headline covers 75% and
 * the standfirst 61%, centred, reaching neither margin.
 */
const MERGED = 0.85

/**
 * Cut a line Vision ran across the gutter back into its two halves.
 *
 * Where to cut is estimated from the proportion of the line's width that falls
 * left of the gutter, then nudged to the nearest space so a word is not severed.
 * It is an estimate — the glyphs are proportional — but it recovers two readable
 * halves from a line that is otherwise wrong in both columns at once.
 */
function splitAtGutter(box: TextBox, gutter: number): TextBox[] {
  const fraction = (gutter - box.x) / box.width
  if (fraction <= 0 || fraction >= 1) return [box]

  const target = Math.round(fraction * box.text.length)
  let cut = target
  for (let step = 0; step < 14; step++) {
    if (box.text[target - step] === " ") {
      cut = target - step
      break
    }
    if (box.text[target + step] === " ") {
      cut = target + step
      break
    }
  }

  const left = box.text.slice(0, cut).trim()
  const right = box.text.slice(cut).trim()
  if (!left || !right) return [box]

  return [
    { ...box, text: left, width: gutter - box.x },
    { ...box, text: right, x: gutter, width: box.x + box.width - gutter },
  ]
}

/**
 * Lines in the order a person would read them.
 *
 * A heading that crosses a gutter breaks the page into bands, because it
 * belongs before both columns rather than inside either. A body line that
 * crosses one is a mistake in the reading, not a feature of the page, and gets
 * cut in two — if it broke the band instead, the article would read first
 * column, second column, *then* first column again.
 */
export function readingOrder(boxes: TextBox[]): string {
  const usable = boxes.filter((b) => b.text.trim().length > 0)
  if (usable.length === 0) return ""

  const splits = gutters(usable)
  const sorted = [...usable].sort((a, b) => topOf(a) - topOf(b))

  // The width of the text block itself, measured from the lines that sit inside
  // a column — the only lines that describe where the columns actually are.
  const settled = usable.filter((b) => !splits.some((gutter) => crosses(b, gutter)))
  const blockWidth =
    settled.length > 0
      ? Math.max(...settled.map((b) => b.x + b.width)) - Math.min(...settled.map((b) => b.x))
      : 1

  // Height is the second signal. Span alone cannot tell a merged line from a
  // headline that happens to run the full width of the block, and height alone
  // cannot tell it from body text — the merged line measured 1.17× the median
  // against body lines at up to 1.34×. Together they are decisive: a merged
  // line is full-width *and* set in body type.
  const heights = usable.map((b) => b.height).sort((a, b) => a - b)
  const medianHeight = heights[Math.floor(heights.length / 2)] ?? 0

  const lines: string[] = []
  let band: TextBox[] = []

  const flush = () => {
    if (band.length > 0) {
      lines.push(...orderBand(band, splits))
      band = []
    }
  }

  for (const box of sorted) {
    const gutter = splits.find((split) => crosses(box, split))

    if (gutter !== undefined) {
      const merged = box.width >= MERGED * blockWidth && box.height <= medianHeight * 1.5
      if (merged) {
        band.push(...splitAtGutter(box, gutter))
        continue
      }
      flush()
      lines.push(box.text)
      continue
    }

    band.push(box)
  }
  flush()

  return joinHyphenated(mergeDropCaps(lines)).join("\n")
}
