import { sql } from "drizzle-orm"
import { customType, index, integer, pgTable, text, uuid, vector } from "drizzle-orm/pg-core"
import { materials } from "./materials"

/** Postgres has the type; Drizzle does not ship a builder for it. */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => "tsvector",
})

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

    /**
     * The full-text vector, **stored rather than computed per query**.
     *
     * ARCHITECTURE.md §5 has always listed `tsv` on this table and the column
     * was never created, so ranked search computed `to_tsvector('english', text)`
     * for every matching chunk on every request. The GIN index made the *match*
     * fast and left the *ranking* to recompute thousands of vectors: measured on
     * the live archive, "prayer" took 870 ms and "god" **2.5 seconds**. With the
     * column stored, `ts_rank` reads it instead of rebuilding it.
     *
     * Generated, not written by hand, so it cannot drift from the text it
     * describes — a chunk rewritten by a re-embed updates its vector in the same
     * statement.
     */
    tsv: tsvector().generatedAlwaysAs(sql`to_tsvector('english', "text")`),
  },
  (t) => [
    index("material_chunks_material_idx").on(t.materialId),

    /** Approximate nearest neighbour over cosine distance. */
    index("material_chunks_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),

    /**
     * Full text over the stored vector. The old index was over the *expression*
     * `to_tsvector('english', text)`, which Postgres can match a query against
     * but which leaves `ts_rank` recomputing the vector for every hit.
     */
    index("material_chunks_fts_idx").using("gin", t.tsv),
  ],
)
