import type { TextBox } from "../text/columns"

/**
 * What an OCR engine is, so that adding one is an implementation rather than a
 * rewrite (ARCHITECTURE.md §7).
 *
 * Pure: types and nothing else. Every engine reaches a network, a filesystem or
 * a wasm runtime, so the implementations live in `src/server/ocr/` — CLAUDE.md
 * keeps all three out of `lib/`.
 *
 * A recogniser returns **boxes, not a string**. That is the whole reason this
 * type exists in this shape: Vision and tesseract both return lines in raster
 * order, straight across the page, so a two-column spread comes back with the
 * columns woven together. `lib/text/columns` rebuilds the reading order from the
 * geometry, and it cannot do that for an engine that has already thrown the
 * geometry away. The archive's stored text read
 * "orn into a Muslim family, I was trained / Not wanting to keep the joy of the
 * Lord to myself" until this was fixed once; a new engine must not reintroduce
 * it.
 */

/** Which engine read a page. Matches the `ocr_engine` enum in the schema. */
export type OcrEngine = "text_layer" | "vision" | "gcv" | "tesseract" | "none"

export type RecognisedPage = {
  /** Line boxes in whatever order the engine produced them. */
  boxes: TextBox[]
  engine: OcrEngine
  /**
   * Whether the engine is prone to inventing text from photographs. tesseract
   * is; Vision and Google Cloud Vision are not. It decides whether the junk
   * filter runs, rather than the filter being applied blindly to output that
   * does not need it.
   */
  hallucinates: boolean
}

/** Pixel dimensions of the image, when the caller already knows them. */
export type PageSize = { width: number; height: number }

/** An engine. One image in, line boxes out. */
export type Recogniser = {
  name: OcrEngine
  /**
   * A rendered page image — WebP, as `lib/pdf/render` writes them.
   *
   * `size` is passed because **tesseract.js does not report it**. Its result
   * object has no `imageWidth` or `imageHeight`, so normalising its boxes
   * against them divides by undefined and every box is silently dropped — the
   * page recognises fine and stores as empty. `material_pages` already holds
   * the width and height from rendering, so the caller simply says.
   */
  read(image: Uint8Array, size?: PageSize): Promise<RecognisedPage>
}

/**
 * The cloud engine has nothing left this month, or is not allowed to spend.
 *
 * Its own class rather than a message match, so the caller can fall back to the
 * free engine on *this* and on nothing else. A quota error must not be confused
 * with a corrupt file or a network blip: those should surface and be retried,
 * while this one should quietly change engine and keep reading. Getting that
 * wrong in either direction is bad — silently downgrading every page because of
 * one timeout, or refusing to read anything for the rest of the month.
 */
export class OcrQuotaError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "OcrQuotaError"
  }
}
