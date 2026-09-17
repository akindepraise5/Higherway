"use server"

import { randomUUID } from "node:crypto"
import { lookup } from "node:dns/promises"
import { tasks } from "@trigger.dev/sdk"
import { revalidatePath } from "next/cache"
import { hasJobs } from "../../lib/env"
import {
  checkImportUrl,
  IMPORT_TIMEOUT_MS,
  isPrivateAddress,
  looksLikePdf,
  MAX_IMPORT_BYTES,
} from "../../lib/import/url-guard"
import { stagingKey } from "../../lib/r2/keys"
import { requireSession } from "../../lib/session"
import { MAX_BATCH, titleFromUrl } from "../../lib/upload/batch"
import type { processMaterial } from "../../trigger/process-material"
import { stageMaterial } from "../materials/stage"
import { presignUpload, putObject } from "../r2/client"

/**
 * Getting a new material into the archive.
 *
 * Two doors, one corridor: a file the browser uploads, or a link the server
 * fetches. Both land the bytes in `staging/` and hand off to the same
 * background task, so an uploaded material and an imported one walk the
 * identical pipeline (ARCHITECTURE.md §6).
 *
 * The browser uploads **straight to R2** with a presigned URL. Vercel refuses
 * request bodies over 4.5 MB and 8.6% of this archive is over 10 MB, so a file
 * that went through the app would simply be rejected.
 *
 * Nothing here renders a page or writes a material row. That happens in the
 * task, off Vercel, where it is not racing a function timeout.
 *
 * **A batch is N of these, not a new mechanism.** Because the bytes never pass
 * through the app, fifty files are fifty parallel PUTs to R2 and fifty
 * independent tasks — there is no request body to outgrow and no single job to
 * fail halfway. What the form has to supply is a queue, per-file progress, and a
 * retry for the one that fails, rather than anything new here.
 *
 * **The material row is created here, not in the task** — pipeline stage 1, which
 * the schema has always described (`staged`: "in r2://staging/, nothing else done
 * yet") and the code skipped.
 *
 * It was created inside `process-material` instead, which meant a material did
 * not exist at all until a worker picked the run up. Two files uploaded to a
 * project whose worker was not running left the form saying "Uploaded. It is
 * being read now" and **the archive showing nothing, anywhere, for ever** — no
 * row, no error, no trace outside the bucket. There was no screen that could
 * have shown it, because there was nothing to show.
 *
 * Now the row appears the moment the bytes land. If the pipeline never runs it
 * sits in `staged` and says so, which is the diagnosis rather than silence.
 */

export type UploadResult =
  | { ok: true; materialId: string; runId: string; message: string }
  | { ok: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Topic ids arrive from the browser, so they are filtered rather than trusted.
 * A malformed one would reach a `uuid` column and throw; an invented one is
 * refused by the foreign key. Deduplicated because the same topic twice would
 * violate the primary key, and capped because no form should be able to file a
 * material under a hundred topics.
 */
const cleanCategoryIds = (ids: string[] | undefined): string[] =>
  [...new Set(ids ?? [])].filter((id) => UUID.test(id)).slice(0, 12)

/**
 * A place for the browser to PUT one file. `MAX_BATCH` lives in
 * `lib/upload/batch` rather than here, because a `"use server"` module may only
 * export async functions — and because the form needs the same number to decide
 * when to stop accepting files.
 */
export type Ticket = { uploadId: string; url: string }

/**
 * URLs the browser can PUT files to, and the ids to quote back afterwards.
 *
 * The ids are generated here rather than accepted from the client: each becomes
 * an object key, and a key a caller can choose is a key a caller can overwrite.
 *
 * Issued in one call rather than one per file. A batch of fifty would otherwise
 * be fifty round trips doing fifty identical session checks before a single byte
 * moved, which is a visible pause on a phone before anything appears to happen.
 */
export async function startUploads(
  count: number,
): Promise<{ ok: true; tickets: Ticket[] } | { ok: false; error: string }> {
  await requireSession()

  if (!hasJobs) {
    return {
      ok: false,
      error:
        "Uploads are turned off until TRIGGER_SECRET_KEY is set — without it the file would sit unprocessed.",
    }
  }

  if (!Number.isInteger(count) || count < 1) {
    return { ok: false, error: "Choose at least one file." }
  }
  if (count > MAX_BATCH) {
    return { ok: false, error: `That is more than ${MAX_BATCH} files. Send them in two batches.` }
  }

  try {
    const tickets = await Promise.all(
      Array.from({ length: count }, async () => {
        const uploadId = randomUUID()
        return { uploadId, url: await presignUpload(stagingKey(uploadId)) }
      }),
    )
    return { ok: true, tickets }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not prepare the upload.",
    }
  }
}

/** One ticket. Kept because a single upload is still the common case. */
export async function startUpload(): Promise<
  { ok: true; uploadId: string; url: string } | { ok: false; error: string }
> {
  const result = await startUploads(1)
  if (!result.ok) return result
  const [ticket] = result.tickets
  if (!ticket) return { ok: false, error: "Could not prepare the upload." }
  return { ok: true, uploadId: ticket.uploadId, url: ticket.url }
}

/** Called once the browser's PUT has finished. Hands the file to the pipeline. */
export async function finishUpload(input: {
  uploadId: string
  title: string
  /** Optional. Most of this archive is unattributed, so it is never required. */
  author?: string
  /** Empty is a real answer: it means Uncategorised. */
  categoryIds?: string[]
}): Promise<UploadResult> {
  const session = await requireSession()

  const title = input.title.trim()
  if (title.length < 2) return { ok: false, error: "Give it a title of at least two characters." }
  if (!hasJobs) return { ok: false, error: "Processing is not configured." }

  // stagingKey asserts the id is a uuid, so a crafted value cannot walk out of
  // the staging prefix.
  let key: string
  try {
    key = stagingKey(input.uploadId)
  } catch {
    return { ok: false, error: "That upload reference is not valid." }
  }

  const materialId = await stageMaterial({
    actorId: session.user.id,
    title,
    author: input.author,
    source: "admin_upload",
    stagingKey: key,
    categoryIds: cleanCategoryIds(input.categoryIds),
  })

  const handle = await tasks.trigger<typeof processMaterial>("process-material", {
    materialId,
    stagingKey: key,
    title,
    author: input.author?.trim() || undefined,
    source: "admin_upload",
    actorId: session.user.id,
    categoryIds: cleanCategoryIds(input.categoryIds),
  })

  revalidatePath("/admin/materials")
  return {
    ok: true,
    materialId,
    runId: handle.id,
    message: "Uploaded. It is in the list now, and will be read shortly.",
  }
}

/**
 * Import a PDF from a link.
 *
 * The server makes this request, so the address is checked twice: once as it
 * was typed, and again after DNS resolves it, because a hostname that looks
 * public can still point at a private address. A gap remains — the name could
 * resolve differently between that check and the fetch — and closing it fully
 * needs a pinned-address agent, which is noted rather than pretended away.
 */
export async function importFromUrl(input: {
  url: string
  title?: string
  author?: string
  categoryIds?: string[]
}): Promise<UploadResult> {
  const session = await requireSession()
  if (!hasJobs) return { ok: false, error: "Processing is not configured." }

  const verdict = checkImportUrl(input.url)
  if (!verdict.ok) return { ok: false, error: verdict.reason }
  const target = verdict.url

  try {
    const resolved = await lookup(target.hostname, { all: true })
    if (resolved.some((address) => isPrivateAddress(address.address))) {
      return { ok: false, error: "That address resolves to a private network." }
    }
  } catch {
    return { ok: false, error: "That address could not be resolved." }
  }

  let bytes: Uint8Array
  try {
    const response = await fetch(target, {
      redirect: "error", // a redirect could land somewhere the checks never saw
      signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS),
    })
    if (!response.ok) {
      return { ok: false, error: `That link returned ${response.status}.` }
    }

    // Trust the header enough to refuse early, never enough to skip the real check.
    const declared = Number(response.headers.get("content-length") ?? 0)
    if (declared > MAX_IMPORT_BYTES) {
      return { ok: false, error: "That file is too large to import." }
    }

    bytes = new Uint8Array(await response.arrayBuffer())
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError"
    return {
      ok: false,
      error: timedOut ? "That link took too long to respond." : "That link could not be fetched.",
    }
  }

  if (bytes.length > MAX_IMPORT_BYTES) {
    return { ok: false, error: "That file is too large to import." }
  }

  // Its own header, not its name and not the server's content-type.
  if (!looksLikePdf(bytes)) {
    return { ok: false, error: "That link is not a PDF." }
  }

  const title = input.title?.trim() || titleFromUrl(target.toString())

  if (title.length < 2) {
    return { ok: false, error: "Give it a title — the link does not supply a usable one." }
  }

  const uploadId = randomUUID()
  const key = stagingKey(uploadId)
  await putObject(key, Buffer.from(bytes), "application/pdf")

  const materialId = await stageMaterial({
    actorId: session.user.id,
    title,
    author: input.author,
    source: "url_import",
    stagingKey: key,
    sourceUrl: target.toString(),
    categoryIds: cleanCategoryIds(input.categoryIds),
  })

  const handle = await tasks.trigger<typeof processMaterial>("process-material", {
    materialId,
    stagingKey: key,
    title,
    author: input.author?.trim() || undefined,
    source: "url_import",
    actorId: session.user.id,
    sourceUrl: target.toString(),
    categoryIds: cleanCategoryIds(input.categoryIds),
  })

  revalidatePath("/admin/materials")
  return {
    ok: true,
    materialId,
    runId: handle.id,
    message: `Fetched “${title}”. It is in the list now.`,
  }
}
