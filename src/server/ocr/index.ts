import { env, hasCloudOcr } from "../../lib/env"
import type { Recogniser } from "../../lib/ocr/types"
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
 *
 * Turning what an engine returns into stored text is `./read`, which is split
 * out because it needs no environment and so can be tested without one.
 */

export function recogniser(): Recogniser {
  return hasCloudOcr && env.GOOGLE_CLOUD_VISION_KEY
    ? googleVision(env.GOOGLE_CLOUD_VISION_KEY)
    : tesseract()
}

export { type ReadPage, readPage } from "./read"
