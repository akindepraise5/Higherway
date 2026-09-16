/**
 * Settling the materials the backfill left stuck.
 *
 * The backfill finished with 27 materials still `staged`. Hashing their bytes
 * showed that most are byte-identical to a material already in the library:
 * the v1 spreadsheet lists the same Drive file twice, so the second copy was
 * refused by `materials_sha256_live_idx` — the index doing its job, surfaced
 * as a crash rather than a decision.
 *
 * This turns that crash into the decision it should have been: archive the
 * duplicate against the material it copies, and remove the bytes nothing refers
 * to any more.
 *
 * **Only exact title matches are archived automatically.** If a staged material
 * is byte-identical to a live one under a *different* title, that is a
 * mis-titling and a human judgement — "The Foundation of Faith Rev. Darrel Lee"
 * holds the same bytes as "Document from Daniel Olorunmaiye", and a script
 * should not decide which name is right.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   pnpm exec tsx --env-file=.env.local scripts/resolve-stuck.ts
 *   pnpm exec tsx --env-file=.env.local scripts/resolve-stuck.ts --apply
 */

import { createHash } from "node:crypto"
import { and, eq, isNull, ne } from "drizzle-orm"
import { materialPages, materials, user } from "../src/db/schema"
import { txdb } from "../src/db/tx"
import { pageKey, pdfKey, thumbKey } from "../src/lib/r2/keys"
import { audit } from "../src/server/audit"
import { deleteObject, getObject } from "../src/server/r2/client"

const APPLY = process.argv.includes("--apply")

type Verdict =
  | { kind: "duplicate"; ofId: string; ofTitle: string }
  | { kind: "mis-titled"; ofId: string; ofTitle: string }
  | { kind: "no-file" }
  | { kind: "not-a-duplicate" }

async function main() {
  console.log(APPLY ? "APPLYING changes\n" : "DRY RUN — nothing will be written\n")

  /**
   * Attribute the change to a person. A trail that says "a script" for 24
   * archived materials is the trail failing at the one moment it matters.
   */
  const [runner] = process.env.SEED_OWNER_EMAIL
    ? await txdb.select().from(user).where(eq(user.email, process.env.SEED_OWNER_EMAIL))
    : []
  if (!runner) {
    console.error("No SEED_OWNER_EMAIL user found — refusing to write an unattributed change.")
    process.exit(1)
  }
  console.log(`attributing to ${runner.email}\n`)

  const stuck = await txdb
    .select({ id: materials.id, title: materials.title })
    .from(materials)
    .where(eq(materials.status, "staged"))
    .orderBy(materials.title)

  const decided: { id: string; title: string; verdict: Verdict }[] = []

  for (const m of stuck) {
    let bytes: Uint8Array
    try {
      bytes = await getObject(pdfKey(m.id))
    } catch {
      decided.push({ ...m, verdict: { kind: "no-file" } })
      continue
    }

    const sha = createHash("sha256").update(bytes).digest("hex")
    const [twin] = await txdb
      .select({ id: materials.id, title: materials.title })
      .from(materials)
      .where(and(eq(materials.sha256, sha), isNull(materials.archivedAt), ne(materials.id, m.id)))
      .limit(1)

    if (!twin) {
      decided.push({ ...m, verdict: { kind: "not-a-duplicate" } })
    } else if (twin.title.trim().toLowerCase() === m.title.trim().toLowerCase()) {
      decided.push({ ...m, verdict: { kind: "duplicate", ofId: twin.id, ofTitle: twin.title } })
    } else {
      decided.push({ ...m, verdict: { kind: "mis-titled", ofId: twin.id, ofTitle: twin.title } })
    }
  }

  for (const d of decided) {
    const note =
      d.verdict.kind === "duplicate"
        ? `archive → "${d.verdict.ofTitle.slice(0, 30)}"`
        : d.verdict.kind === "mis-titled"
          ? `HELD BACK — same bytes as "${d.verdict.ofTitle.slice(0, 30)}"`
          : d.verdict.kind === "no-file"
            ? "left alone — no file in R2"
            : "left alone — not a duplicate"
    console.log(`  ${d.title.slice(0, 42).padEnd(44)} ${note}`)
  }

  const toArchive = decided.filter((d) => d.verdict.kind === "duplicate")
  console.log(`\n${toArchive.length} to archive, ${decided.length - toArchive.length} left alone`)

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write.")
    return
  }

  let archived = 0
  let objectsDeleted = 0
  let bytesFreed = 0

  for (const d of toArchive) {
    if (d.verdict.kind !== "duplicate") continue

    // Read the page rows before the transaction removes them, so the R2 keys
    // are still known afterwards.
    const pages = await txdb
      .select({ pageNumber: materialPages.pageNumber })
      .from(materialPages)
      .where(eq(materialPages.materialId, d.id))

    await txdb.transaction(async (tx) => {
      await tx
        .update(materials)
        .set({
          status: "archived",
          archivedAt: new Date(),
          duplicateOfId: d.verdict.kind === "duplicate" ? d.verdict.ofId : null,
          updatedAt: new Date(),
        })
        .where(eq(materials.id, d.id))

      // The surviving material has its own pages; these are a second copy of
      // the same reading of the same bytes.
      await tx.delete(materialPages).where(eq(materialPages.materialId, d.id))

      await audit(tx, {
        action: "material.archive",
        entityType: "material",
        entityId: d.id,
        before: { status: "staged" },
        after: {
          status: "archived",
          name: d.title,
          reason:
            "Byte-identical to a material already in the library — the v1 sheet lists the same Drive file twice.",
          duplicateOf: d.verdict.kind === "duplicate" ? d.verdict.ofTitle : undefined,
        },
        actorId: runner.id,
      })
    })
    archived++

    // Only after the row is safely archived. If the transaction had failed,
    // deleting first would have destroyed a file still referenced by a row.
    for (const key of [
      pdfKey(d.id),
      thumbKey(d.id),
      ...pages.map((p) => pageKey(d.id, p.pageNumber)),
    ]) {
      try {
        if (key === pdfKey(d.id)) {
          const bytes = await getObject(key).catch(() => null)
          if (bytes) bytesFreed += bytes.length
        }
        await deleteObject(key)
        objectsDeleted++
      } catch {
        console.log(`    could not delete ${key}`)
      }
    }
  }

  console.log(`\narchived: ${archived}`)
  console.log(`objects deleted: ${objectsDeleted}`)
  console.log(`freed: ${(bytesFreed / 1024 / 1024).toFixed(1)} MB of PDFs (plus their page images)`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("FAILED:", error instanceof Error ? error.message : error)
    process.exit(1)
  })
