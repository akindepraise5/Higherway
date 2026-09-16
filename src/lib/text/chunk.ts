/**
 * Splitting a material's text into chunks for embedding. ARCHITECTURE.md §9.
 *
 * Chunks are what let a meaning-based search result point at a *page* rather
 * than at a document, so the reader can open where the answer actually is.
 *
 * The archive averages 1.68 pages per material, so most materials produce one
 * or two chunks and the page boundary is the natural split. Longer booklets
 * are split within a page, with overlap so a sentence spanning the boundary
 * is not lost to both chunks.
 *
 * Pure by design (CLAUDE.md): no database, no network, no environment.
 */

export type PageText = { pageNumber: number; text: string }

export type Chunk = {
  /** Null for a chunk that spans pages or has no page context. */
  pageNumber: number | null
  text: string
}

/** bge-small takes 512 tokens; ~350 words leaves room for subword splitting. */
export const MAX_WORDS = 350
/** Enough to carry a sentence across a boundary. */
export const OVERLAP_WORDS = 40
/** Below this a chunk is not worth embedding on its own. */
export const MIN_WORDS = 12

/** Split one page's text into chunks, keeping its page number. */
export function chunkPage(page: PageText): Chunk[] {
  const words = page.text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  if (words.length <= MAX_WORDS) {
    return [{ pageNumber: page.pageNumber, text: words.join(" ") }]
  }

  const chunks: Chunk[] = []
  const step = MAX_WORDS - OVERLAP_WORDS

  for (let start = 0; start < words.length; start += step) {
    const slice = words.slice(start, start + MAX_WORDS)

    // A final sliver is folded into the previous chunk rather than embedded alone.
    if (slice.length < MIN_WORDS && chunks.length > 0) break

    chunks.push({ pageNumber: page.pageNumber, text: slice.join(" ") })
    if (start + MAX_WORDS >= words.length) break
  }

  return chunks
}

/**
 * Chunk a whole material. Short pages are merged with their neighbours so a
 * two-line cover page does not become its own meaningless embedding — the
 * merged chunk loses its page number, since it no longer belongs to one page.
 */
export function chunkMaterial(pages: PageText[]): Chunk[] {
  const chunks: Chunk[] = []
  let carry: { pageNumber: number; words: string[] } | null = null

  for (const page of pages) {
    const words = page.text.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) continue

    if (carry) {
      const merged: string[] = [...carry.words, ...words]
      const samePage: boolean = carry.pageNumber === page.pageNumber
      carry = null

      if (merged.length < MIN_WORDS) {
        carry = { pageNumber: page.pageNumber, words: merged }
        continue
      }
      chunks.push(
        ...chunkPage({
          pageNumber: samePage ? page.pageNumber : -1,
          text: merged.join(" "),
        }).map((c) => ({ ...c, pageNumber: samePage ? page.pageNumber : null })),
      )
      continue
    }

    if (words.length < MIN_WORDS) {
      carry = { pageNumber: page.pageNumber, words }
      continue
    }

    chunks.push(...chunkPage(page))
  }

  // Anything still carried is real text; keep it rather than lose it.
  if (carry && carry.words.length > 0) {
    chunks.push({ pageNumber: carry.pageNumber, text: carry.words.join(" ") })
  }

  return chunks
}

/**
 * One text for the whole document, used for the document-level embedding that
 * drives "similar meaning" duplicate detection and related materials.
 */
export function documentText(pages: PageText[], maxWords = 1200): string {
  const words = pages
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean)

  return words.slice(0, maxWords).join(" ")
}
