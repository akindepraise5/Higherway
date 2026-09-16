"use server"

import { randomUUID } from "node:crypto"
import { lookup } from "node:dns/promises"
import { tasks } from "@trigger.dev/sdk"
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
import type { processMaterial } from "../../trigger/process-material"
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
 */

export type UploadResult =
  | { ok: true; runId: string; message: string }
  | { ok: false; error: string }

/**
 * A URL the browser can PUT the file to, and the id to quote back afterwards.
 *
 * The id is generated here rather than accepted from the client: it becomes an
 * object key, and a key a caller can choose is a key a caller can overwrite.
 */
export async function startUpload(): Promise<
  { ok: true; uploadId: string; url: string } | { ok: false; error: string }
> {
  await requireSession()

  if (!hasJobs) {
    return {
      ok: false,
      error:
        "Uploads are turned off until TRIGGER_SECRET_KEY is set — without it the file would sit unprocessed.",
    }
  }

  const uploadId = randomUUID()
  try {
    const url = await presignUpload(stagingKey(uploadId))
    return { ok: true, uploadId, url }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not prepare the upload.",
    }
  }
}

/** Called once the browser's PUT has finished. Hands the file to the pipeline. */
export async function finishUpload(input: {
  uploadId: string
  title: string
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

  const handle = await tasks.trigger<typeof processMaterial>("process-material", {
    stagingKey: key,
    title,
    source: "admin_upload",
    actorId: session.user.id,
  })

  return {
    ok: true,
    runId: handle.id,
    message: "Uploaded. It is being read now, and will appear once that finishes.",
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
export async function importFromUrl(input: { url: string; title?: string }): Promise<UploadResult> {
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

  const title =
    input.title?.trim() ||
    decodeURIComponent(target.pathname.split("/").pop() ?? "")
      .replace(/\.pdf$/i, "")
      .replace(/[-_]+/g, " ")
      .trim()

  if (title.length < 2) {
    return { ok: false, error: "Give it a title — the link does not supply a usable one." }
  }

  const uploadId = randomUUID()
  const key = stagingKey(uploadId)
  await putObject(key, Buffer.from(bytes), "application/pdf")

  const handle = await tasks.trigger<typeof processMaterial>("process-material", {
    stagingKey: key,
    title,
    source: "url_import",
    actorId: session.user.id,
    sourceUrl: target.toString(),
  })

  return {
    ok: true,
    runId: handle.id,
    message: `Fetched “${title}”. It is being read now.`,
  }
}
