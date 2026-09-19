import { eq } from "drizzle-orm"
import { db } from "../../db"
import { categories } from "../../db/schema"
import { txdb } from "../../db/tx"
import { audit } from "../audit"

/**
 * Give topics their one-line description — the sentence under the name on the
 * home page tiles and on the topic's own page, and half of what a topic's
 * embedding is built from, so it also sharpens topic suggestions.
 *
 * **Fills gaps; never overwrites.** A topic that already has a description is
 * left exactly as it is and reported as skipped. Someone may have written that
 * one by hand in the admin panel, and a bulk command replacing a person's words
 * with a default is the wrong way round. Changing an existing description stays
 * in the panel, one topic at a time.
 *
 * One transaction and one `category.describe` entry per topic changed, as if
 * each had been typed in by hand — the same rule the bulk actions on the
 * materials table follow, because the trail answers questions one topic at a
 * time. Merged topics are skipped: they have no page of their own any more.
 */

export type DescribeEntry = { slug: string; blurb: string }

export type DescribeOutcome = {
  slug: string
  outcome: "write" | "already-described" | "merged" | "not-found"
  blurb?: string
}

type Row = { id: string; blurb: string | null; mergedIntoId: string | null }

function decide(entry: DescribeEntry, current: Row | undefined): DescribeOutcome {
  if (!current) return { slug: entry.slug, outcome: "not-found" }
  if (current.mergedIntoId) return { slug: entry.slug, outcome: "merged" }
  if (current.blurb?.trim()) {
    return { slug: entry.slug, outcome: "already-described", blurb: current.blurb }
  }
  return { slug: entry.slug, outcome: "write", blurb: entry.blurb.trim() }
}

const columns = {
  id: categories.id,
  blurb: categories.blurb,
  mergedIntoId: categories.mergedIntoId,
}

/** What would happen. Reads only, on the HTTP handle. */
export async function planDescriptions(entries: DescribeEntry[]): Promise<DescribeOutcome[]> {
  const out: DescribeOutcome[] = []
  for (const entry of entries) {
    const [current] = await db
      .select(columns)
      .from(categories)
      .where(eq(categories.slug, entry.slug))
      .limit(1)
    out.push(decide(entry, current))
  }
  return out
}

/**
 * Do it. Every decision is taken again inside the transaction rather than
 * trusted from the plan, so a description someone typed into the panel between
 * the dry run and this one is still left alone.
 */
export async function describeCategories(input: {
  entries: DescribeEntry[]
  actorId: string
}): Promise<DescribeOutcome[]> {
  return txdb.transaction(async (tx) => {
    const out: DescribeOutcome[] = []

    for (const entry of input.entries) {
      const [current] = await tx
        .select(columns)
        .from(categories)
        .where(eq(categories.slug, entry.slug))
        .limit(1)

      const decision = decide(entry, current)
      out.push(decision)
      if (decision.outcome !== "write" || !current || decision.blurb === undefined) continue

      await tx
        .update(categories)
        .set({ blurb: decision.blurb, updatedAt: new Date() })
        .where(eq(categories.id, current.id))

      await audit(tx, {
        action: "category.describe",
        entityType: "category",
        entityId: current.id,
        before: { blurb: current.blurb },
        after: { blurb: decision.blurb },
        actorId: input.actorId,
      })
    }

    return out
  })
}
