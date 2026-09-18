import type { PageSize, RecognisedPage, Recogniser } from "../../lib/ocr/types"
import type { TextBox } from "../../lib/text/columns"

/**
 * tesseract.js — the engine that needs no credentials at all.
 *
 * This is what makes the project work out of the box, which CLAUDE.md requires:
 * with no Google key and no Mac, a photographed PDF uploaded to the dashboard
 * still ends up searchable. It is the worst of the three engines and it is
 * never the one chosen when another is available.
 *
 * Measured on real files from this archive (ARCHITECTURE.md §7): ~2.73 s a page
 * at ~90–95%, against Vision's 0.73 s at ~97–99%. Two habits matter more than
 * the accuracy number:
 *
 * - **It interleaves two-column pages.** So do the others; that is why a
 *   recogniser here returns boxes rather than a string and `lib/text/columns`
 *   rebuilds the order from the geometry.
 * - **It invents text from photographs**, emitting consonant runs that are not
 *   words. `hallucinates` is true, which is what turns on `lib/ocr/clean`.
 *
 * The worker is created once and kept. Starting one costs a wasm instantiation
 * and a ~10 MB language download; doing that per page would cost more than the
 * recognition. It is never torn down on purpose — the task's process ending is
 * what releases it, and a worker that has been terminated mid-batch is a far
 * worse failure than one held a few minutes longer than needed.
 */

// biome-ignore lint/suspicious/noExplicitAny: tesseract.js ships no exported worker type
let worker: Promise<any> | null = null

function ready() {
  if (!worker) {
    worker = import("tesseract.js").then((t) => t.createWorker("eng"))
  }
  return worker
}

export function tesseract(): Recogniser {
  return {
    name: "tesseract",
    async read(image: Uint8Array, size?: PageSize): Promise<RecognisedPage> {
      const engine = await ready()

      /**
       * `blocks` has to be asked for. Without it the result carries `text` and
       * nothing else — no geometry, so no column ordering, and a two-column page
       * is stored with its columns woven together. The archive has been through
       * that once already.
       */
      const { data } = await engine.recognize(Buffer.from(image), {}, { blocks: true, text: true })

      return { boxes: toBoxes(data, size), engine: "tesseract", hallucinates: true }
    },
  }
}

type Bbox = { x0: number; y0: number; x1: number; y1: number }
type Line = { text: string; confidence: number; bbox: Bbox }
type Paragraph = { lines?: Line[] }
type Block = { paragraphs?: Paragraph[] }

/**
 * Lines into the shape `lib/text/columns` expects, normalised to 0–1.
 *
 * A fraction of the page, not pixels: the gutter thresholds in `columns` are
 * fractions, so pixel coordinates would make them depend on the resolution the
 * page happened to be rendered at.
 */
function toBoxes(data: { blocks?: Block[] | null }, size?: PageSize): TextBox[] {
  const lines: Line[] = []
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        if (line.text.trim().length > 0) lines.push(line)
      }
    }
  }
  if (lines.length === 0) return []

  /**
   * The caller's dimensions if it has them, otherwise the furthest any box
   * reaches.
   *
   * The fallback is a genuine approximation — a page whose text stops short of
   * the right margin normalises to slightly the wrong scale — but it is a far
   * better answer than the previous one, which was to divide by `undefined` and
   * return no boxes at all.
   */
  const width = size?.width || Math.max(...lines.map((l) => l.bbox.x1))
  const height = size?.height || Math.max(...lines.map((l) => l.bbox.y1))
  if (width === 0 || height === 0) return []

  const boxes: TextBox[] = []
  for (const line of lines) {
    boxes.push({
      text: line.text.trim(),
      // tesseract reports 0–100; everything downstream expects 0–1.
      confidence: line.confidence / 100,
      x: line.bbox.x0 / width,
      y: line.bbox.y0 / height,
      width: (line.bbox.x1 - line.bbox.x0) / width,
      height: (line.bbox.y1 - line.bbox.y0) / height,
    })
  }
  return boxes
}
