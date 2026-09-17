import { env, hasCloudOcr } from "../../lib/env"
import { stripInvented, survivingShare } from "../../lib/ocr/clean"
import type { OcrEngine, PageSize, Recogniser } from "../../lib/ocr/types"
import { readingOrder } from "../../lib/text/columns"
import { dehyphenate } from "../../lib/text/dehyphenate"
import { scoreText } from "../../lib/text/quality"
import { googleVision } from "./google-vision"
import { tesseract } from "./tesseract"

/**
 * Choosing an engine, and turning what it returns into stored text.
 *
 * The strategy in ARCHITECTURE.md §7, cheapest first. Stages 1 and 2 of it
 * happen elsewhere — the embedded text layer in `ingestPdf`, macOS Vision in
 * `scripts/ocr-local.ts` — and this is stages 3 and 4, the ones that run on a
 * server:
 *
 * 1. **Google Cloud Vision** when `GOOGLE_CLOUD_VISION_KEY` is set. ~35 pages a
 *    month against a 1,000-page free allowance, so free permanently; Google
 *    wants a card on file even at zero spend, which is why it is optional.
 * 2. **tesseract.js** otherwise, always. Worse, and it means the archive is
 *    searchable with no credentials of any kind — which CLAUDE.md requires.
 *
 * `hasCloudOcr` has existed in `src/lib/env.ts` since Phase 1 with no reader
 * anywhere. This is its first one.
 */

export function recogniser(): Recogniser {
  return hasCloudOcr && env.GOOGLE_CLOUD_VISION_KEY
    ? googleVision(env.GOOGLE_CLOUD_VISION_KEY)
    : tesseract()
}

export type ReadPage = {
  text: string
  engine: OcrEngine
  /** 0–1, from `lib/text/quality`. Null when the page came back empty. */
  quality: number | null
  /**
   * Share of the recognised words that survived the junk filter. 1 for an
   * engine that does not invent. A low number is a photograph, not a page.
   */
  surviving: number
}

/**
 * Read one rendered page image into the text that gets stored.
 *
 * The order of the four steps is not arbitrary, and each one exists because
 * skipping it produced a specific wrong result in this archive:
 *
 * 1. **`readingOrder`** — every engine returns lines in raster order, straight
 *    across the page, so a two-column spread arrives with its columns woven
 *    together. This is what made the stored text read "orn into a Muslim
 *    family, I was trained / Not wanting to keep the joy of the Lord to myself".
 * 2. **`stripInvented`**, only for an engine that invents. Applied to Vision's
 *    output it would be deleting real words to solve a problem Vision does not
 *    have.
 * 3. **`dehyphenate`** — printers break words across lines, and a search for
 *    "received" must find "re-\nceived". It runs *after* the column ordering,
 *    because which line follows which is exactly what the ordering decides.
 * 4. **`scoreText`** — the quality score is how a bad read surfaces instead of
 *    quietly poisoning search.
 */
export async function readPage(
  image: Uint8Array,
  engine?: Recogniser,
  size?: PageSize,
): Promise<ReadPage> {
  const reader = engine ?? recogniser()
  const page = await reader.read(image, size)

  const ordered = readingOrder(page.boxes)
  const cleaned = page.hallucinates ? stripInvented(ordered) : ordered
  const text = dehyphenate(cleaned).trim()

  return {
    text,
    engine: page.engine,
    quality: text.length > 0 ? scoreText(text).score : null,
    surviving: page.hallucinates ? survivingShare(ordered, cleaned) : 1,
  }
}
