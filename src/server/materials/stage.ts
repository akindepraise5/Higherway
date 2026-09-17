import { randomUUID } from "node:crypto"
import { inArray } from "drizzle-orm"
import { categories, materialCategories, materials } from "../../db/schema"
import { txdb } from "../../db/tx"
import { audit } from "../audit"
import type { IngestSource } from "../ingest"

/**
 * Pipeline stage 1: the file is in `r2://staging/` and nothing else has happened.
 *
 * Not in `services/uploads.ts`, though that is its main caller, because a
 * `"use server"` module exports server *actions* — anything exported from one is
 * callable from a browser, and creating a material row is not something a page
 * should be able to ask for directly. Drive sync needs the same function and is
 * not a server action at all.
 *
 * It still writes its audit entry in the same transaction as the change, which
 * is what CLAUDE.md requires of every mutation; it is the service layer's rule
 * that is being honoured here, not avoided.
 */

/**
 * Record a staged file as a material, before anything has been done to it.
 *
 * Pipeline stage 1. The row exists from this moment, so an admin can always see
 * what they added and what state it is in — including "nothing has happened to
 * this yet", which is a real and diagnosable state and used to be invisible.
 *
 * No slug and no checksum yet: both need the bytes, which are in R2 and have
 * never been near the app. The task fills them in. That is also why a duplicate
 * cannot be caught here — it is caught in the task, and rejects this row with a
 * reason rather than leaving the person to wonder.
 */
export async function stageMaterial(input: {
  actorId: string
  title: string
  author?: string
  source: IngestSource
  stagingKey: string
  sourceUrl?: string
  driveFileId?: string
  categoryIds: string[]
}): Promise<string> {
  return txdb.transaction(async (tx) => {
    const [row] = await tx
      .insert(materials)
      .values({
        // A placeholder until the task can make a real one: the slug has to be
        // unique among live rows and is derived from the title, so two staged
        // uploads sharing a title would collide on it here. It is replaced on
        // publish, and nothing public can reach a staged material.
        slug: `staged-${randomUUID()}`,
        title: input.title,
        author: input.author?.trim() || null,
        status: "staged",
        source: input.source,
        // Where the file actually is right now. Overwritten when it moves.
        r2KeyPdf: input.stagingKey,
        driveFileId: input.driveFileId ?? null,
      })
      .returning({ id: materials.id })

    if (!row) throw new Error("The material row was not created")

    await audit(tx, {
      action: "material.create",
      entityType: "material",
      entityId: row.id,
      after: { name: input.title, source: input.source, sourceUrl: input.sourceUrl },
      actorId: input.actorId,
    })

    if (input.categoryIds.length > 0) {
      const named = await tx
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(inArray(categories.id, input.categoryIds))

      if (named.length > 0) {
        await tx.insert(materialCategories).values(
          named.map((topic, ordinal) => ({
            materialId: row.id,
            categoryId: topic.id,
            ordinal,
            assignedBy: input.actorId,
          })),
        )
        for (const topic of named) {
          await audit(tx, {
            action: "material.categorise",
            entityType: "material",
            entityId: row.id,
            after: { topic: topic.name },
            actorId: input.actorId,
          })
        }
      }
    }

    return row.id
  })
}
