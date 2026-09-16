import { sql } from "drizzle-orm"
import { index, integer, pgTable, text, uuid, vector } from "drizzle-orm/pg-core"
import { materials } from "./materials"

/**
 * Search is three methods fused by reciprocal rank (ARCHITECTURE.md §9):
 * Postgres full text, fuzzy titles via pg_trgm, and meaning via pgvector.
 *
 * Chunks are what make the third one useful: a hit carries a page number, so
 * a result can open the reader at the right page rather than at page one.
 *
 * 384 dimensions is deliberate — bge-small runs locally for free, and the
 * whole index stays inside Neon's 0.5 GB free plan. Changing this number
 * means re-checking that. ARCHITECTURE.md §3.
 */
export const materialChunks = pgTable(
  "material_chunks",
  {
    id: uuid().primaryKey().defaultRandom(),
    materialId: uuid()
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),

    /** Null for a document-level chunk; set when the text came from one page. */
    pageNumber: integer(),

    text: text().notNull(),
    embedding: vector({ dimensions: 384 }),
  },
  (t) => [
    index("material_chunks_material_idx").on(t.materialId),

    /** Approximate nearest neighbour over cosine distance. */
    index("material_chunks_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),

    /** Full text over the chunk itself, so snippets can be extracted. */
    index("material_chunks_fts_idx").using("gin", sql`to_tsvector('english', ${t.text})`),
  ],
)
