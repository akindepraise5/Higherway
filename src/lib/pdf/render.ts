import sharp from "sharp"

/**
 * Reading a PDF: its pages as images, and its text if it already has any.
 * ARCHITECTURE.md §6 (stages 3 and 4) and §7.
 *
 * The archive is a mix — born-digital PDFs with real text inside, CamScanner
 * phone scans, and raw phone photos of printed pages. Step one of the OCR
 * chain is always "does this already have text", because when it does, the
 * answer is perfect and free. Only when it does not do we render pages and
 * hand them to an OCR engine.
 *
 * mupdf is loaded lazily with a dynamic import: it is an async WASM module,
 * so importing it at module scope breaks anything that only wants the types.
 */

export type RenderedPage = {
  pageNumber: number
  webp: Buffer
  width: number
  height: number
}

export type PdfText = {
  pageNumber: number
  text: string
}

/** Reading width for the in-site reader. */
export const READING_WIDTH = 1400

/**
 * Quality 72. Measured on real pages from this archive: ~200-280 KB per page,
 * against ~490 KB at quality 80. These are photographic scans, so they do not
 * compress like text — the whole archive still lands near 2.4 GB, roughly a
 * quarter of R2's free tier. ARCHITECTURE.md §7.
 */
export const WEBP_QUALITY = 72

/** The small image used on cards and in search results. */
export const THUMB_WIDTH = 360

// biome-ignore lint/suspicious/noExplicitAny: mupdf ships no types for its WASM entry point
type MuPdf = any

let mupdfPromise: Promise<MuPdf> | null = null

async function mupdf(): Promise<MuPdf> {
  if (!mupdfPromise) mupdfPromise = import("mupdf")
  return mupdfPromise
}

async function open(bytes: Uint8Array) {
  const mu = await mupdf()
  return mu.Document.openDocument(bytes, "application/pdf")
}

export async function pageCount(bytes: Uint8Array): Promise<number> {
  return open(bytes).then((doc) => doc.countPages())
}

/**
 * The text already inside the PDF, page by page. Empty strings for pages that
 * are pure image — which is most of this archive, but not all of it: a sample
 * checked during planning held 3,249 characters of real text on page one.
 */
export async function extractText(bytes: Uint8Array): Promise<PdfText[]> {
  const doc = await open(bytes)
  const out: PdfText[] = []

  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i)
    out.push({ pageNumber: i + 1, text: String(page.toStructuredText().asText() ?? "").trim() })
  }
  return out
}

/**
 * Whether the embedded text is worth using. A scanned page sometimes carries a
 * few stray characters — a header, a page number stamped by the scanner — and
 * treating that as "this document has text" would skip OCR on a page that
 * needs it. Real text runs to hundreds of characters per page.
 */
export function hasUsableText(pages: PdfText[]): boolean {
  if (pages.length === 0) return false
  const total = pages.reduce((n, p) => n + p.text.length, 0)
  return total / pages.length >= 200
}

/**
 * Render pages to WebP at reading width. `scale` is derived per page rather
 * than fixed, because page sizes vary across the archive and a fixed zoom
 * would give a 24 MB file a different reading width from a 1 MB one.
 */
export async function renderPages(
  bytes: Uint8Array,
  options: { width?: number; quality?: number; pages?: number[] } = {},
): Promise<RenderedPage[]> {
  const mu = await mupdf()
  const doc = await open(bytes)
  const width = options.width ?? READING_WIDTH
  const quality = options.quality ?? WEBP_QUALITY

  const wanted = options.pages ?? Array.from({ length: doc.countPages() }, (_, i) => i + 1)
  const out: RenderedPage[] = []

  for (const pageNumber of wanted) {
    if (pageNumber < 1 || pageNumber > doc.countPages()) continue

    const page = doc.loadPage(pageNumber - 1)
    const bounds = page.getBounds() as [number, number, number, number]
    const pageWidth = bounds[2] - bounds[0]
    const scale = pageWidth > 0 ? width / pageWidth : 2

    const pixmap = page.toPixmap(
      mu.Matrix.scale(scale, scale),
      mu.ColorSpace.DeviceRGB,
      false,
      true,
    )
    const png = Buffer.from(pixmap.asPNG())

    const webp = await sharp(png).webp({ quality }).toBuffer()

    out.push({
      pageNumber,
      webp,
      width: pixmap.getWidth(),
      height: pixmap.getHeight(),
    })
  }

  return out
}

/** The cover thumbnail, made from page one. */
export async function renderThumbnail(bytes: Uint8Array): Promise<Buffer | null> {
  const [first] = await renderPages(bytes, { width: THUMB_WIDTH, quality: 70, pages: [1] })
  return first ? first.webp : null
}
