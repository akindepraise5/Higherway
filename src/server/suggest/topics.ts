import { sql } from "drizzle-orm"
import { db } from "../../db"

/**
 * Suggesting topics for a material — pipeline stage 7 (ARCHITECTURE.md §6, §8).
 *
 * Two signals, merged, because **measured against 253 materials a person filed
 * by hand, neither is good enough alone and together they are much better**:
 *
 * | | right, top 3 | when it offered |
 * |---|---|---|
 * | topic name only | 45% | 45% |
 * | neighbours only (≥0.2) | 38% | 58% |
 * | **both, merged** | **56%** | 56% |
 *
 * The neighbour vote is the more precise and the more timid: it declines to
 * answer for a third of materials and is right 58% of the time when it does —
 * 74% above 0.4. The name comparison always answers and is right less often.
 * Merging takes the neighbours' answer first and fills the remaining slots from
 * the names, so nothing is ever offered nothing.
 *
 * **The names alone were the obvious design and the column `categories.embedding`
 * exists for it.** 46 of the 58 live topics have no sub-text, so each vector is
 * a single generic word, and "Faith" and "Prayer" sit near the middle of
 * everything a church publication says — they won nearly every comparison. The
 * cheapest available improvement to this whole feature is writing a one-line
 * description for the 46 topics that have none.
 *
 * The other signal asks a better question: not *which topic name is this text
 * like*, but **what are the materials most like this one already filed under**.
 * 253 hand-filed materials describe what "Testimony" means in this archive far
 * better than the word does, and a topic covering two unrelated subjects is
 * handled, where one vector per topic averages them into neither.
 *
 * Nothing here files anything. It proposes, an editor accepts, and the
 * acceptance is what writes `material_categories` with `suggested` set — the
 * archive does not get filed by a machine acting on its own.
 */

export type Suggestion = {
  categoryId: string
  name: string
  /** How it was arrived at, which decides how firmly it is put. */
  from: "neighbours" | "name"
  /** Ready to show, and checkable in a second — unlike a number. */
  because: string
  /** Neighbour votes above this are right about three times in four. */
  strong: boolean
}

/**
 * How many similar materials to look at.
 *
 * Small enough that they are genuinely similar — the archive is 566 published
 * materials and a neighbourhood of 50 reaches well past anything related — and
 * large enough that one oddly-filed material cannot decide the answer alone.
 */
const NEIGHBOURS = 15

/**
 * The share of the neighbourhood's weight a topic must carry to be offered.
 *
 * 0.2, chosen by sweeping it against the 253 filed materials rather than picked:
 * 0.2 merged gives 56%, 0.25 gives 54% and 0.3 gives 51%. Higher floors are more
 * precise per answer and cost more than they gain once the names are filling the
 * remaining slots anyway.
 */
const FLOOR = 0.2

/** Above this, a neighbour vote was right 74% of the time. Said more firmly. */
const STRONG = 0.4

const HOW_MANY = 3

export async function suggestTopics(materialId: string, limit = HOW_MANY): Promise<Suggestion[]> {
  /**
   * The neighbourhood and the vote are one question, so they are one query.
   *
   * `page_number is null` picks the document chunk — the vector standing for
   * the whole material rather than one of its pages. A page vector would find
   * materials sharing that page's subject, which for a two-page testimony is
   * whatever its opening paragraph happens to be about.
   *
   * The material is excluded from its own neighbourhood. It is its own nearest
   * neighbour by a wide margin, and leaving it in would make every filed
   * material confidently predict what it is already filed under — which looks
   * like accuracy and measures nothing.
   */
  const voted = rows<{ id: string; name: string; weight: number; count: number; total: number }>(
    await db.execute(sql`
      with me as (
        select embedding from material_chunks
         where material_id = ${materialId}::uuid
           and page_number is null and embedding is not null
         limit 1
      ),
      near as (
        select mc.material_id,
               1 - (mc.embedding <=> (select embedding from me)) as similarity
          from material_chunks mc
          join materials m on m.id = mc.material_id
         where mc.page_number is null
           and mc.embedding is not null
           and mc.material_id <> ${materialId}::uuid
           and m.archived_at is null
         order by mc.embedding <=> (select embedding from me)
         limit ${NEIGHBOURS}
      )
      select c.id, c.name,
             sum(near.similarity)::float as weight,
             count(*)::int as count,
             (select sum(similarity) from near)::float as total
        from near
        join material_categories mcat on mcat.material_id = near.material_id
        join categories c on c.id = mcat.category_id and c.merged_into_id is null
       group by c.id, c.name
       order by weight desc
       limit ${limit}`),
  )

  const suggestions: Suggestion[] = []

  for (const row of voted) {
    /**
     * Share of the neighbourhood's *similarity*, not of its count. A neighbour
     * at 0.94 is better evidence than one scraping in at 0.61, and counting
     * them treats the two as the same.
     */
    const confidence = row.total > 0 ? row.weight / row.total : 0
    if (confidence < FLOOR) continue

    suggestions.push({
      categoryId: row.id,
      name: row.name,
      from: "neighbours",
      strong: confidence >= STRONG,
      because: `${row.count} of the ${NEIGHBOURS} most similar materials ${
        row.count === 1 ? "is" : "are"
      } filed here`,
    })
  }

  if (suggestions.length >= limit) return suggestions.slice(0, limit)

  /**
   * Fill the rest from the topic vectors. Weaker, and it is the reason nothing
   * is ever offered nothing: the vote declines on roughly a third of materials,
   * and an unfiled material with no suggestion at all is the state this feature
   * exists to remove.
   */
  const taken = new Set(suggestions.map((s) => s.categoryId))
  const named = rows<{ id: string; name: string; blurb: string | null }>(
    await db.execute(sql`
      with me as (
        select embedding from material_chunks
         where material_id = ${materialId}::uuid
           and page_number is null and embedding is not null
         limit 1
      )
      select c.id, c.name, c.blurb
        from categories c
       where c.embedding is not null
         and c.merged_into_id is null
         and exists (select 1 from me)
       order by c.embedding <=> (select embedding from me)
       limit ${limit}`),
  )

  for (const row of named) {
    if (suggestions.length >= limit) break
    if (taken.has(row.id)) continue
    suggestions.push({
      categoryId: row.id,
      name: row.name,
      from: "name",
      strong: false,
      because: row.blurb
        ? "the text reads like this topic's description"
        : "the text reads like this topic's name",
    })
  }

  return suggestions
}

function rows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? (result as T[])) as T[]
}
