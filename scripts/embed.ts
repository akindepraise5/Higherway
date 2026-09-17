/**
 * Give the archive its embeddings — pipeline stage 5.
 *
 *   pnpm embed                  every material that has text and no chunks
 *   pnpm embed --topics         only re-embed the 69 topics
 *   pnpm embed --force          re-embed everything, including what is done
 *   pnpm embed --limit 20       stop after N materials, to look before committing
 *
 * Read, chunk, embed, insert. It touches no R2 object, renders nothing and
 * runs no recogniser — `material_pages.text` is already 100% populated, so the
 * inputs are all in the database.
 *
 * **Resumable by construction.** Without `--force` it selects materials that
 * have text and no chunks, so an interrupted run continues rather than
 * restarting, and re-running it after new uploads only does the new ones.
 *
 * The model is ~33 MB and downloads once on first use, then comes off disk.
 * Everything else is local: no API, no account, no quota, nothing sent
 * anywhere (ARCHITECTURE.md §3).
 */

import { isNull, sql } from "drizzle-orm"
import { db } from "../src/db"
import { materials } from "../src/db/schema"
import { embedCategories, embedMaterial, unembedded } from "../src/server/embed/store"

const args = process.argv.slice(2)
const topicsOnly = args.includes("--topics")
const force = args.includes("--force")

const limitArg = args.indexOf("--limit")
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : undefined
if (limitArg >= 0 && (!Number.isInteger(limit) || (limit ?? 0) < 1)) {
  console.error("--limit wants a whole number of materials")
  process.exit(1)
}

async function main() {
  console.log("seeding topic vectors…")
  const topics = await embedCategories()
  console.log(`  ${topics} topics embedded from name and sub-text\n`)

  if (topicsOnly) return

  /**
   * `--force` takes every live material with text, not just the unembedded
   * ones. `embedMaterial` replaces rather than appends, so re-running it is
   * safe — the old chunks go in the same transaction as the new.
   */
  const ids = force
    ? (
        await db
          .select({ id: materials.id })
          .from(materials)
          .where(
            sql`${materials.archivedAt} is null and exists (
                  select 1 from material_pages mp
                   where mp.material_id = ${materials.id} and mp.text is not null)`,
          )
          .orderBy(materials.createdAt)
      ).map((r) => r.id)
    : await unembedded()

  const queue = limit ? ids.slice(0, limit) : ids
  console.log(`${queue.length} materials to embed${force ? " (--force)" : ""}`)
  if (queue.length === 0) {
    console.log("nothing to do")
    return
  }

  const started = Date.now()
  let chunks = 0
  let skipped = 0
  let failed = 0

  for (const [i, id] of queue.entries()) {
    try {
      const result = await embedMaterial(id)
      chunks += result.chunks
      if (!result.embedded) skipped++
    } catch (error) {
      failed++
      // Recorded per material and kept going. One unreadable material must not
      // end a run over six hundred of them, and the id is what makes it
      // findable afterwards.
      console.error(`  ${id} failed: ${error instanceof Error ? error.message : error}`)
    }

    if ((i + 1) % 25 === 0 || i === queue.length - 1) {
      const each = (Date.now() - started) / (i + 1) / 1000
      console.log(`  ${i + 1}/${queue.length} · ${chunks} chunks · ${each.toFixed(2)}s each`)
    }
  }

  const empty = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(materials)
    .where(isNull(materials.archivedAt))

  console.log(
    `\n${queue.length - failed - skipped} embedded, ${chunks} chunks written` +
      `${skipped > 0 ? `, ${skipped} had no text` : ""}` +
      `${failed > 0 ? `, ${failed} failed` : ""}` +
      ` · ${empty[0]?.n ?? 0} live materials`,
  )
  console.log("\nCheck one before trusting the lot — see RUNBOOK.md.")
}

main()
  .catch((e) => {
    console.error("embed failed:", e instanceof Error ? e.message : e)
    process.exit(1)
  })
  .then(() => process.exit(0))
