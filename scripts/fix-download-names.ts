/**
 * Give already-stored PDFs a proper download name.
 *
 *   pnpm fix:names           every published material
 *   pnpm fix:names --limit 5
 *
 * Files uploaded before Content-Disposition was set would save as
 * "original.pdf". This rewrites the object's metadata in place with
 * CopyObject — no download, no re-render, no re-upload of the bytes.
 *
 * Safe to re-run: setting the same header twice changes nothing.
 *
 * Worth knowing: the *key* stays `materials/<id>/original.pdf`. Keys are what
 * the database stores, so they must not move — the display name lives in the
 * header instead. See ARCHITECTURE.md §2.
 */

import { CopyObjectCommand } from "@aws-sdk/client-s3"
import { isNotNull } from "drizzle-orm"
import { db } from "../src/db"
import { materials } from "../src/db/schema"
import { contentDisposition, downloadFilename } from "../src/lib/r2/keys"
import { bucket, r2 } from "../src/server/r2/client"

const args = process.argv.slice(2)
const limit = Number(args[args.indexOf("--limit") + 1]) || Infinity

async function main() {
  const rows = await db
    .select({ id: materials.id, title: materials.title, key: materials.r2KeyPdf })
    .from(materials)
    .where(isNotNull(materials.r2KeyPdf))

  const queue = rows.slice(0, limit === Infinity ? undefined : limit)
  console.log(`${queue.length} files to rename\n`)

  let done = 0
  let failed = 0

  for (const row of queue) {
    if (!row.key) continue
    try {
      await r2().send(
        new CopyObjectCommand({
          Bucket: bucket(),
          Key: row.key,
          CopySource: `${bucket()}/${row.key}`,
          MetadataDirective: "REPLACE",
          ContentType: "application/pdf",
          ContentDisposition: contentDisposition(row.title),
        }),
      )
      done++
      if (done <= 5 || done % 50 === 0) {
        console.log(`  ${done}. ${downloadFilename(row.title)}`)
      }
    } catch (error) {
      failed++
      console.error(`  failed: ${row.title} — ${error instanceof Error ? error.message : error}`)
    }
  }

  console.log(`\nDone. renamed ${done}, failed ${failed}`)
}

main().catch((error) => {
  console.error("\nRename failed:", error instanceof Error ? error.message : error)
  process.exit(1)
})
