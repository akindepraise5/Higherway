import { sql } from "drizzle-orm"
import { db } from "../../db"

/**
 * Ranked search over the archive — ARCHITECTURE.md §9.
 *
 * **What this replaces.** The library matched with `ilike '%term%'` over titles,
 * summaries and page text, and sorted by date. Measured against the live
 * archive, "prayer" returned **371 of 624 materials**, "heaven" 352, "salvation"
 * 287 — and every one of them weighted the same, so a material *about* prayer
 * sat below one that mentions it once on page 3 simply because it was older. A
 * result set that is 59% of the archive in no particular order is not a search.
 *
 * Four retrievals, fused by **reciprocal rank** rather than by adding scores
 * together. That matters: `ts_rank` and trigram `similarity` are different
 * quantities on different scales with no meaningful common unit, and summing
 * them would let whichever happens to run larger dominate. RRF only ever reads
 * each list's *ordering*, which is the one thing they genuinely share.
 *
 * | | Finds | Index |
 * |---|---|---|
 * | Chunk full text | the word anywhere in the document, ranked by density | `material_chunks_fts_idx` |
 * | Title / author / summary full text | what the material *is* | none needed at 566 rows |
 * | Fuzzy title | "holines", "anchour" — typos and OCR'd titles | `materials_title_trgm_idx` |
 * | Topic name | shelved under Prayer without saying "prayer" | small table |
 * | Substring | fragments full text stems away — **only when the rest found little** | `material_pages_text_trgm_idx` |
 *
 * **The old substring match is kept as a fifth list, but only when it is
 * needed.** Dropping it lost recall in a way that is easy to miss: full text
 * stems, so "holines" and "holiness" are different words to it, while
 * `ilike '%holines%'` matched *inside* "holiness" and found 83 materials. The
 * ranked version found 3. Three with the right one first beats 83 in no order,
 * but "beats" is not "supersedes" — a reader who types a fragment should still
 * find the thing.
 *
 * It is also by far the slowest: measured per list on the live archive, "god"
 * costs 432 ms in chunk full text, 102 ms in fuzzy titles and **579 ms** in the
 * substring scan. So it runs as a **second query, only when the first found
 * little** — which is exactly when a fragment is the likely explanation. A query
 * that already has plenty of ranked results gains nothing from it, and every
 * substring hit for "prayer" was one the other lists had already found.
 *
 * **No migration.** Every index this needs was created in `0000`/`0001` and has
 * been sitting unused; the chunks it reads were written on 2026-09-17.
 *
 * **Meaning is deliberately absent, for now.** `material_chunks.embedding` holds
 * 4,569 vectors and the HNSW index is there, but comparing against them needs
 * the *query* embedded, and the model is 33 MB of ONNX that would have to load
 * inside a public page request. That is the wrong place for it. The gap is
 * recorded in STATUS rather than papered over — and the four lists below are
 * what the fifth would be fused onto, not a substitute for it.
 */

/** The conventional RRF constant. Large enough that rank 1 does not swamp all. */
const K = 60

/**
 * What each list is worth.
 *
 * A title match is the strongest evidence of what a material *is*; the body text
 * is the broadest but the weakest per hit, since every material mentions prayer.
 * A topic is a human's judgement and so is trusted, but it is shared by dozens of
 * materials and cannot distinguish between them, which is why it is lowest.
 *
 * Starting values, tuned against real queries rather than argued about — see the
 * measurements in STATUS.
 */
const WEIGHT = {
  meta: 1.6,
  title: 1.3,
  chunk: 1.0,
  topic: 0.6,
  /**
   * Lowest by a distance, and it has no meaningful internal order — a substring
   * either occurs or it does not. It is here for recall alone: a material only
   * this list can find should appear at the bottom rather than not at all.
   */
  substring: 0.25,
} as const

/**
 * Below this many results, the substring list is worth its cost.
 *
 * Above it the reader has plenty and the extra recall is noise; below it they
 * may have typed a fragment and found almost nothing, which is the case the
 * slow scan exists for.
 */
const SPARSE = 15

export type Hit = {
  materialId: string
  score: number
  /** The page the strongest text hit was on, when it came from the text. */
  page: number | null
  /** Which lists found it, for explaining a result and for measuring. */
  from: string[]
}

/**
 * Rank every published material against a query, best first.
 *
 * Returns *all* matches rather than a page of them. At 566 published materials
 * that is a few hundred rows at worst, and it lets the caller apply the topic
 * and author filters before paging — filtering after would give short pages and
 * a wrong total.
 */
export async function rankedSearch(term: string): Promise<Hit[]> {
  const cleaned = term.trim().replace(/\s+/g, " ")
  if (cleaned.length === 0) return []

  const result = await db.execute(
    sql`
    with q as (
      select websearch_to_tsquery('english', ${cleaned}) as tsq, ${cleaned}::text as raw
    ),
    chunk_hits as (
      -- mc.tsv is the stored generated column, not a recomputed expression.
      -- Ranking against to_tsvector(text) rebuilt the vector for every hit:
      -- "god" matched most of the 4,569 chunks and took 2.5 seconds.
      -- (No backticks in here: this is inside a tagged template literal.)
      select mc.material_id,
             max(ts_rank(mc.tsv, (select tsq from q))) as rank,
             (array_agg(mc.page_number order by ts_rank(mc.tsv, (select tsq from q)) desc))[1]
               as page
        from material_chunks mc
        join materials m on m.id = mc.material_id and m.status = 'published'
       where mc.tsv @@ (select tsq from q)
       group by mc.material_id
    ),
    meta_hits as (
      select m.id as material_id,
             ts_rank(
               setweight(to_tsvector('english', coalesce(m.title, '')), 'A') ||
               setweight(to_tsvector('english', coalesce(m.author, '')), 'B') ||
               setweight(to_tsvector('english', coalesce(m.summary, '')), 'C'),
               (select tsq from q)
             ) as rank
        from materials m
       where m.status = 'published'
         and (
           setweight(to_tsvector('english', coalesce(m.title, '')), 'A') ||
           setweight(to_tsvector('english', coalesce(m.author, '')), 'B') ||
           setweight(to_tsvector('english', coalesce(m.summary, '')), 'C')
         ) @@ (select tsq from q)
    ),
    title_hits as (
      -- word_similarity, not similarity, and the difference decides whether
      -- typo tolerance works at all. similarity() compares the query against
      -- the WHOLE title, so "anchour" against "The Anchor that holds" scores
      -- far below the threshold and finds nothing — the title is mostly words
      -- the reader did not type. word_similarity compares it against the
      -- best-matching run of words inside the title, which is what someone
      -- half-remembering a title is actually doing.
      --
      -- The <% operator is word_similarity's, and gin_trgm_ops serves it from
      -- materials_title_trgm_idx exactly as it serves %.
      --
      -- Matched on word_similarity, ranked on whole-title similarity, and the
      -- split matters. word_similarity returns 1.0 for ANY title containing the
      -- word, so ranking by it puts every title holding "prayer" on an equal
      -- footing and the order inside that tie is arbitrary — "Surrender: a vital
      -- part of effective prayer" came out above "excerpts on Prayer". Ranking
      -- by whole-title similarity puts the title that is *mostly* the query
      -- first, which is what someone typing a title means.
      --
      -- The threshold is explicit rather than the <% operator's, whose default
      -- of 0.6 rejected "chrstian home" against "The Christian Home". That gives
      -- up the index, and it costs nothing here: 566 published titles is a scan
      -- Postgres does without noticing.
      select m.id as material_id,
             similarity(lower(m.title), lower((select raw from q))) as rank
        from materials m
       where m.status = 'published'
         and word_similarity(lower((select raw from q)), lower(m.title)) > 0.42
    ),
    topic_hits as (
      select mcat.material_id, 1.0::float as rank
        from material_categories mcat
        join categories c on c.id = mcat.category_id and c.merged_into_id is null
        join materials m on m.id = mcat.material_id and m.status = 'published'
       where to_tsvector('english', c.name) @@ (select tsq from q)
    ),
    everything as (
      select material_id, 'chunk' as source, rank, page from chunk_hits
      union all select material_id, 'meta',  rank, null from meta_hits
      union all select material_id, 'title', rank, null from title_hits
      union all select material_id, 'topic', rank, null from topic_hits
    ),
    ranked as (
      select material_id, source, page,
             row_number() over (partition by source order by rank desc, material_id) as pos
        from everything
    )
    select material_id,
           -- Every parameter is cast. Without them the driver sends these as
           -- untyped text and Postgres refuses with "operator does not exist:
           -- text / bigint", which names neither the parameter nor the line.
           sum(
             case source
               when 'meta'  then ${WEIGHT.meta}::float
               when 'title' then ${WEIGHT.title}::float
               when 'chunk' then ${WEIGHT.chunk}::float
               else ${WEIGHT.topic}::float
             end / (${K}::float + pos)
           )::float as score,
           max(page) as page,
           array_agg(distinct source) as sources
      from ranked
     group by material_id
     order by score desc
     limit 500`,
  )

  const rows = ((result as { rows?: unknown[] }).rows ?? result) as {
    material_id: string
    score: number
    page: number | null
    sources: string[]
  }[]

  const hits: Hit[] = rows.map((row) => ({
    materialId: row.material_id,
    score: row.score,
    page: row.page,
    from: row.sources,
  }))

  if (hits.length >= SPARSE) return hits
  return fuseSubstring(cleaned, hits)
}

/**
 * Add whatever a plain substring match finds, fused at the lowest weight.
 *
 * In JavaScript rather than a sixth CTE, because it is a *second query* run
 * conditionally — the whole point is that the scan does not happen for the
 * common case. The arithmetic is the same reciprocal rank the SQL does.
 *
 * The list has no meaningful internal order: a substring either occurs or it
 * does not. Position therefore comes from the database's own row order, which
 * is arbitrary but stable, and the weight is low enough that it decides nothing
 * except whether a material appears at all.
 */
async function fuseSubstring(term: string, found: Hit[]): Promise<Hit[]> {
  const result = await db.execute(sql`
    select distinct p.material_id
      from material_pages p
      join materials m on m.id = p.material_id and m.status = 'published'
     where regexp_replace(p.text, '[[:space:]]+', ' ', 'g') ilike ${`%${term}%`}
     limit 300`)

  const extra = ((result as { rows?: unknown[] }).rows ?? result) as { material_id: string }[]
  if (extra.length === 0) return found

  const byId = new Map(found.map((h) => [h.materialId, { ...h }]))

  for (const [index, row] of extra.entries()) {
    const bump = WEIGHT.substring / (K + index + 1)
    const existing = byId.get(row.material_id)
    if (existing) {
      existing.score += bump
      if (!existing.from.includes("substring")) existing.from = [...existing.from, "substring"]
    } else {
      byId.set(row.material_id, {
        materialId: row.material_id,
        score: bump,
        page: null,
        from: ["substring"],
      })
    }
  }

  return [...byId.values()].sort((a, b) => b.score - a.score)
}
