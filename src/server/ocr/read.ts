import { stripInvented, survivingShare } from "../../lib/ocr/clean"
import { type OcrEngine, OcrQuotaError, type PageSize, type Recogniser } from "../../lib/ocr/types"
import { readingOrder } from "../../lib/text/columns"
import { dehyphenate } from "../../lib/text/dehyphenate"
import { scoreText } from "../../lib/text/quality"
import { tesseract } from "./tesseract"

/**
 * Turning a recognised page into the text that gets stored.
 *
 * Separate from `./index`, which picks the engine, because picking one reads
 * `process.env` and this does not. Split, the ordering, the junk filter, the
 * de-hyphenation and — most of all — the fallback can be tested with no
 * environment at all, which is the same reason `src/lib` is pure.
 */

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
 * **Running out of cloud allowance is not a failure.** Vision's free tier is
 * 1,000 pages a month and this archive uses roughly 35, so it should never be
 * reached — but "should never" is not a plan, and being wrong means either a
 * surprise bill or a page stored with no text. A quota refusal therefore falls
 * through to tesseract for that page and the run carries on. `ocr_engine`
 * records the engine that *actually* read it, so a fallback read is visible
 * afterwards and can be upgraded with `pnpm ocr:local`.
 *
 * Belt and braces, and the braces are outside this codebase: set a hard quota
 * limit on the Cloud Vision API in the Google Cloud console. That cannot be
 * bypassed by a bug here, which a check in application code always can be.
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
  /**
   * Required, not defaulted. Choosing an engine reads the environment, and a
   * default here would drag that back into this module and undo the split.
   * `read-material` asks `recogniser()` once and passes it for every page,
   * which is also what lets tesseract reuse its worker.
   */
  reader: Recogniser,
  size?: PageSize,
): Promise<ReadPage> {
  let page: Awaited<ReturnType<Recogniser["read"]>>
  try {
    page = await reader.read(image, size)
  } catch (error) {
    /**
     * Only a quota refusal, and only from the cloud engine.
     *
     * A corrupt file or a dropped connection must still surface and be retried;
     * quietly downgrading every page because of one timeout would leave the
     * archive read at 90–95% with nothing saying why. `OcrQuotaError` is a
     * distinct type precisely so this line can be narrow.
     */
    if (!(error instanceof OcrQuotaError)) throw error
    console.warn(`${reader.name} is out of allowance — falling back to tesseract: ${error.message}`)
    page = await tesseract().read(image, size)
  }

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
