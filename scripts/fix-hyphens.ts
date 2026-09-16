/**
 * Rejoin words split across a line in text that never went through OCR.
 *
 *   pnpm exec tsx --env-file=.env.local scripts/fix-hyphens.ts
 *   pnpm exec tsx --env-file=.env.local scripts/fix-hyphens.ts --apply
 *
 * A PDF carrying its own text layer has that text lifted straight out by
 * `extractText`, which never touches `readingOrder` — so de-hyphenation, which
 * lived inside that function, never reached it. `pnpm ocr:local --force` cannot
 * help either: it excludes `text_layer` pages deliberately, because that text
 * is exact and free and re-reading a photograph of it would be strictly worse.
 *
 * Those pages therefore keep "admis-" / "sion" permanently, and a split word
 * cannot be searched for — which is the whole reason the text is public
 * (ARCHITECTURE.md §7).
 *
 * De-hyphenation is a pure text transformation, so it needs no re-reading at
 * all: the fix is to run it over the stored text. Dry run by default.
 */

import { eq, sql } from "drizzle-orm"
import { materialPages } from "../src/db/schema"
import { txdb } from "../src/db/tx"
import { dehyphenate } from "../src/lib/text/dehyphenate"

const APPLY = process.argv.includes("--apply")

/**
 * Which stored text to repair. Defaults to every engine, because both paths
 * have now been damaged by the same cause.
 *
 * Embedded text never passed through `readingOrder` at all. Vision text did —
 * but the `--force` re-read ran while `KEEPS_HYPHEN` still listed "re", "pre",
 * "co" and "ex", so it *wrote* "re-ceived" into 46 pages before that list was
 * cut back. Neither needs re-reading: de-hyphenation is a pure transformation
 * over text that already exists.
 */
const engineArg = process.argv.indexOf("--engine")
const ENGINE = engineArg >= 0 ? process.argv[engineArg + 1] : null

async function main() {
  console.log(APPLY ? "APPLYING changes\n" : "DRY RUN — nothing will be written\n")
  console.log(ENGINE ? `scope: ocr_engine = '${ENGINE}'\n` : "scope: all stored text\n")

  const rows = await txdb
    .select({ id: materialPages.id, text: materialPages.text })
    .from(materialPages)
    .where(
      ENGINE
        ? sql`${materialPages.ocrEngine} = ${ENGINE} and ${materialPages.text} is not null`
        : sql`${materialPages.text} is not null`,
    )

  let changed = 0
  let joins = 0
  const samples: string[] = []

  for (const row of rows) {
    const before = row.text ?? ""
    const after = dehyphenate(before)
    if (after === before) continue

    changed++
    joins += before.split("\n").length - after.split("\n").length

    if (samples.length < 5) {
      const line = before.split("\n").find((l) => /\w[-–]$/.test(l))
      if (line) samples.push(line.slice(-52))
    }

    if (APPLY) {
      await txdb.update(materialPages).set({ text: after }).where(eq(materialPages.id, row.id))
    }
  }

  console.log(`${rows.length} pages examined`)
  console.log(`  ${changed} have a word split across a line`)
  console.log(`  ${joins} words would be put back together\n`)
  for (const s of samples) console.log(`    "${s}"`)

  if (!APPLY) console.log("\nDry run. Re-run with --apply to write.")
  else console.log(`\nRewrote ${changed} pages.`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("failed:", error instanceof Error ? error.message : error)
    process.exit(1)
  })
