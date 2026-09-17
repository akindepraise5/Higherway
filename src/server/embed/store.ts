import { and, eq, isNotNull, isNull, sql } from "drizzle-orm"
import { db } from "../../db"
import { categories, materialChunks, materialPages, materials } from "../../db/schema"
import { txdb } from "../../db/tx"
import { chunkMaterial } from "../../lib/text/chunk"
import { embedDocument, embedDocuments } from "./index"

/**
 * Writing embeddings into the database — pipeline stage 5 (ARCHITECTURE.md §6).
 *
 * **Everything this needs was built in Phase 1 and never called.** `embedDocuments`,
 * `chunkMaterial` and `lib/vector` were written, unit-tested, and then had zero
 * importers anywhere in the repo, so `material_chunks` and `categories.embedding`
 * were both empty. Three separate gaps trace back to that one omission: meaning
 * has no part in search, `scoreDuplicate` silently defaults its `embedding`
 * signal to 0, and there is nothing to suggest a topic from.
 *
 * It reads from the database and writes back to it. No R2, no rendering, no
 * recogniser — `material_pages.text` is 100% populated, so this is read, chunk,
 * embed, insert.
 */

/** A document-level chunk has no page: it stands for the whole material. */
export const DOCUMENT_CHUNK = null

export type EmbedResult = {
  materialId: string
  chunks: number
  /** False when the material has no text worth embedding. Not a failure. */
  embedded: boolean
}

/**
 * Embed one material: a chunk per page-sized piece, plus one for the document.
 *
 * The document chunk is what a topic suggestion and a duplicate's meaning
 * signal compare against — both are questions about the whole material, and
 * asking them of a page vector would answer about that page instead.
 *
 * Idempotent by replacement. Re-embedding after the text changes has to remove
 * the old chunks: leaving them would keep vectors of text that no longer exists
 * in the same index as the ones that replaced it, and search would rank against
 * both.
 */
export async function embedMaterial(materialId: string): Promise<EmbedResult> {
  const pages = await db
    .select({ pageNumber: materialPages.pageNumber, text: materialPages.text })
    .from(materialPages)
    .where(and(eq(materialPages.materialId, materialId), isNotNull(materialPages.text)))
    .orderBy(materialPages.pageNumber)

  const chunks = chunkMaterial(pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text ?? "" })))

  if (chunks.length === 0) {
    // No text yet — a photographed PDF waiting on a recogniser. Clear whatever
    // was there so nothing stale is left behind, and say so rather than
    // throwing: this is an ordinary state, not a fault.
    await txdb.delete(materialChunks).where(eq(materialChunks.materialId, materialId))
    return { materialId, chunks: 0, embedded: false }
  }

  /**
   * The document vector is the material's text, capped at what the model can
   * actually read. bge-small takes 512 tokens and silently truncates past that,
   * so feeding it a whole booklet embeds its first page and calls it the
   * document — the cap is explicit here so the truncation is a decision rather
   * than a surprise.
   */
  const whole = chunks
    .map((c) => c.text)
    .join(" ")
    .split(/\s+/)
    .slice(0, 350)
    .join(" ")

  const vectors = await embedDocuments(chunks.map((c) => c.text))
  const documentVector = await embedDocument(whole)

  await txdb.transaction(async (tx) => {
    await tx.delete(materialChunks).where(eq(materialChunks.materialId, materialId))

    await tx.insert(materialChunks).values([
      ...chunks.map((chunk, i) => ({
        materialId,
        pageNumber: chunk.pageNumber,
        text: chunk.text,
        embedding: vectors[i] as number[],
      })),
      {
        materialId,
        pageNumber: DOCUMENT_CHUNK,
        text: whole,
        embedding: documentVector,
      },
    ])
  })

  return { materialId, chunks: chunks.length + 1, embedded: true }
}

/** The document vector of a material, or null if it has not been embedded. */
export async function documentVector(materialId: string): Promise<number[] | null> {
  const [row] = await db
    .select({ embedding: materialChunks.embedding })
    .from(materialChunks)
    .where(and(eq(materialChunks.materialId, materialId), isNull(materialChunks.pageNumber)))
    .limit(1)

  return row?.embedding ?? null
}

/**
 * Give every topic a vector, from its name and its sub-text.
 *
 * This is the whole of the free category suggestion: a material's document
 * vector against 69 topic vectors, nearest three. No account, no credentials,
 * no `hasSuggestions` flag — which is just as well, since that flag gates a
 * Cloudflare Workers AI client that has never existed.
 *
 * The blurb matters more than it looks. "Faith" alone is a single word with
 * little to distinguish it; "Faith — trusting God when the way is not visible"
 * is a sentence the model can place. Only 12 of 69 topics have sub-text, which
 * is the cheapest available improvement to suggestion quality.
 */
export async function embedCategories(): Promise<number> {
  const rows = await db
    .select({ id: categories.id, name: categories.name, blurb: categories.blurb })
    .from(categories)
    .where(isNull(categories.mergedIntoId))

  if (rows.length === 0) return 0

  const vectors = await embedDocuments(
    rows.map((c) => (c.blurb ? `${c.name} — ${c.blurb}` : c.name)),
  )

  await txdb.transaction(async (tx) => {
    for (const [i, row] of rows.entries()) {
      await tx
        .update(categories)
        .set({ embedding: vectors[i] as number[] })
        .where(eq(categories.id, row.id))
    }
  })

  return rows.length
}

/**
 * Materials that have text but no chunks — what a backfill still has to do.
 *
 * Counted rather than listed where only the number is wanted, because the
 * listing is the expensive half and "how much is left" is asked far more often
 * than "which ones".
 */
export async function unembedded(limit?: number): Promise<string[]> {
  const rows = await db
    .select({ id: materials.id })
    .from(materials)
    .where(
      and(
        isNull(materials.archivedAt),
        sql`exists (select 1 from material_pages mp
                     where mp.material_id = ${materials.id} and mp.text is not null)`,
        sql`not exists (select 1 from material_chunks mc
                         where mc.material_id = ${materials.id})`,
      ),
    )
    .orderBy(materials.createdAt)
    .limit(limit ?? 100_000)

  return rows.map((r) => r.id)
}
