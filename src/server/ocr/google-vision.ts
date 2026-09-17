import type { RecognisedPage, Recogniser } from "../../lib/ocr/types"
import type { TextBox } from "../../lib/text/columns"

/**
 * Google Cloud Vision, over its REST API.
 *
 * **No new dependency.** The official client library pulls in the whole Google
 * auth stack; this is one `fetch` against `images:annotate` with an API key, and
 * an API key is what `GOOGLE_CLOUD_VISION_KEY` already is. A task that runs a
 * few times a week does not need a connection pool.
 *
 * `DOCUMENT_TEXT_DETECTION`, not `TEXT_DETECTION`: the first is the dense-text
 * model meant for scanned pages, the second is meant for a shop sign in a
 * photograph. On this archive — phone photographs of printed two-column pages —
 * that is the difference between a page and a handful of words.
 *
 * At 1.68 pages per material and a few uploads a week this is roughly **35 pages
 * a month against a free allowance of 1,000**, so it is free permanently
 * (ARCHITECTURE.md §7). The catch, recorded there and still true: Google wants a
 * billing account on file even at zero spend. Declining costs nothing —
 * tesseract takes over on its own.
 */

const ENDPOINT = "https://vision.googleapis.com/v1/images:annotate"

/** A page is small; a minute is generous and still bounded. */
const TIMEOUT_MS = 60_000

type Vertex = { x?: number; y?: number }

type Word = {
  boundingBox?: { vertices?: Vertex[] }
  confidence?: number
  symbols?: { text?: string }[]
}

type Paragraph = { words?: Word[] }
type Block = { paragraphs?: Paragraph[] }
type Page = { width?: number; height?: number; blocks?: Block[] }

type Response = {
  responses?: {
    fullTextAnnotation?: { pages?: Page[] }
    error?: { message?: string }
  }[]
}

export function googleVision(apiKey: string): Recogniser {
  return {
    name: "gcv",
    // The `size` hint is ignored: Vision reports the dimensions it measured.
    async read(image: Uint8Array): Promise<RecognisedPage> {
      const body = {
        requests: [
          {
            image: { content: Buffer.from(image).toString("base64") },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            // The archive is English. Saying so stops the detector spending its
            // confidence deciding between scripts it will never see.
            imageContext: { languageHints: ["en"] },
          },
        ],
      }

      const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })

      if (!response.ok) {
        throw new Error(`Google Cloud Vision returned ${response.status}`)
      }

      const json = (await response.json()) as Response
      const first = json.responses?.[0]

      /**
       * A 200 with an error inside it. Vision reports a rejected image this way
       * — quota, a corrupt file, an unsupported format — and reading only the
       * HTTP status would take it for an empty page and store nothing, which
       * looks exactly like a page that genuinely has no text.
       */
      if (first?.error?.message) {
        throw new Error(`Google Cloud Vision: ${first.error.message}`)
      }

      return {
        boxes: toBoxes(first?.fullTextAnnotation?.pages ?? []),
        engine: "gcv",
        hallucinates: false,
      }
    },
  }
}

/**
 * Words into line boxes, in the shape `lib/text/columns` expects.
 *
 * Vision hands back a word tree, not lines. Words are grouped by paragraph and
 * a paragraph's box is the union of its words', which is close enough to a line
 * for the gutter detection: what that needs is where text sits across the page
 * width, and a paragraph answers that as well as a line does.
 *
 * Coordinates are normalised to 0–1 against the page, because `columns` measures
 * gutters as a fraction of the width and a pixel value would make its thresholds
 * depend on the render resolution.
 */
function toBoxes(pages: Page[]): TextBox[] {
  const boxes: TextBox[] = []

  for (const page of pages) {
    const width = page.width ?? 0
    const height = page.height ?? 0
    if (width === 0 || height === 0) continue

    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        const words = paragraph.words ?? []
        if (words.length === 0) continue

        const text = words
          .map((word) => (word.symbols ?? []).map((s) => s.text ?? "").join(""))
          .join(" ")
          .trim()
        if (text.length === 0) continue

        const vertices = words.flatMap((w) => w.boundingBox?.vertices ?? [])
        const xs = vertices.map((v) => v.x ?? 0)
        const ys = vertices.map((v) => v.y ?? 0)
        if (xs.length === 0) continue

        const left = Math.min(...xs) / width
        const right = Math.max(...xs) / width
        const top = Math.min(...ys) / height
        const bottom = Math.max(...ys) / height

        const confidences = words.map((w) => w.confidence ?? 0).filter((c) => c > 0)

        boxes.push({
          text,
          confidence:
            confidences.length > 0
              ? confidences.reduce((a, b) => a + b, 0) / confidences.length
              : 0.9,
          x: left,
          y: top,
          width: right - left,
          height: bottom - top,
        })
      }
    }
  }

  return boxes
}
