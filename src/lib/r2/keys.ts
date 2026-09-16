/**
 * Where everything lives in R2. ARCHITECTURE.md §2 and §6.
 *
 * R2 is the source of truth for files, so the key scheme has to stay stable:
 * changing it later means rewriting every stored path. Keys are derived from
 * database ids and nothing else, so a material's files are always findable
 * from its row alone, with no lookup table.
 *
 *   staging/<uploadId>.pdf                  before review; expires after 30 days
 *   materials/<materialId>/original.pdf     the file people download
 *   materials/<materialId>/pages/<n>.webp   the reader
 *   materials/<materialId>/thumb.webp       covers and search results
 *
 * Pure by design (CLAUDE.md): no environment, no network. The client that
 * uses these lives in src/server/r2/.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const STAGING_PREFIX = "staging/"
export const MATERIALS_PREFIX = "materials/"

/**
 * Ids come from the database, so in normal operation these always pass. The
 * check exists because a key is a path: an id carrying "../" or a slash would
 * write outside its prefix, and a storage layer should not depend on every
 * caller being careful.
 */
export function assertId(id: string): string {
  if (!UUID.test(id)) {
    throw new Error(`Not a valid id for a storage key: ${JSON.stringify(id)}`)
  }
  return id
}

function assertPageNumber(page: number): number {
  if (!Number.isInteger(page) || page < 1) {
    throw new Error(`Page numbers start at 1, got ${page}`)
  }
  return page
}

/** Where an upload sits before anyone has approved it. */
export const stagingKey = (uploadId: string): string => `${STAGING_PREFIX}${assertId(uploadId)}.pdf`

/** The original PDF — what a download serves, byte for byte as supplied. */
export const pdfKey = (materialId: string): string =>
  `${MATERIALS_PREFIX}${assertId(materialId)}/original.pdf`

/** One rendered page for the in-site reader. */
export const pageKey = (materialId: string, pageNumber: number): string =>
  `${MATERIALS_PREFIX}${assertId(materialId)}/pages/${assertPageNumber(pageNumber)}.webp`

/** The small image used on cards and in search results. */
export const thumbKey = (materialId: string): string =>
  `${MATERIALS_PREFIX}${assertId(materialId)}/thumb.webp`

/** Every key belonging to one material, for moving it out of staging. */
export const materialPrefix = (materialId: string): string =>
  `${MATERIALS_PREFIX}${assertId(materialId)}/`

export const isStagingKey = (key: string): boolean => key.startsWith(STAGING_PREFIX)

/**
 * The public address of a stored object, served from the bucket's custom
 * domain. Cloudflare's free r2.dev address is rate-limited and documented as
 * not for production, so this always goes through cdn-higherway.
 */
export function publicUrl(key: string, base: string): string {
  if (!base) throw new Error("R2_PUBLIC_BASE_URL is not set")
  return `${base.replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`
}
