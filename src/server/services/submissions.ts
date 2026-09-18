"use server"

import { randomUUID } from "node:crypto"
import { tasks } from "@trigger.dev/sdk"
import { headers } from "next/headers"
import { hasJobs, hasSubmissions } from "../../lib/env"
import { stagingKey } from "../../lib/r2/keys"
import { MAX_SUBMISSION, titleFromFilename } from "../../lib/upload/batch"
import type { processMaterial } from "../../trigger/process-material"
import { stageMaterial } from "../materials/stage"
import { presignUpload } from "../r2/client"
import { verifyTurnstile } from "../turnstile"

/**
 * Letting a reader send something in — ARCHITECTURE.md §6, source
 * `public_submission`.
 *
 * **This is the only unauthenticated door in the project**, and every rule below
 * exists because of that rather than because of the form. Handing an anonymous
 * visitor a presigned URL to our bucket is handing them write access to it for a
 * few minutes; the question is not whether that is convenient but what bounds it.
 *
 * What bounds it:
 *
 * - **Turnstile is checked before a single URL is issued**, and a failure to
 *   check — no secret, verifier unreachable — refuses rather than passes. The
 *   dangerous failure mode is an environment variable going missing in a deploy
 *   and the bucket standing open until somebody notices.
 * - **A token is single use**, so one solved challenge buys one submission. That
 *   is the property that stops a bot which beats the widget once from replaying
 *   it across a thousand uploads.
 * - **Ten files, not sixty.** An admin batching fifty scans is a known person
 *   doing a known job; a stranger is not, and ten is enough for anyone sending
 *   in what they have.
 * - **Nothing is published.** Every submission lands in review like any upload,
 *   and the review queue is what the owner asked this form to be short *because*
 *   of: "the review queue already exists to catch what is missing, so the form
 *   does not have to".
 *
 * And what the form deliberately does **not** do: ask for anything. The owner's
 * constraint, recorded word for word — anyone who arrives wanting to contribute
 * is doing us a favour, and every field is a chance to decide it is not worth
 * the time. The file, and an optional way to say who you are. A title we can
 * correct later beats a form nobody finishes.
 */

export type SubmissionTicket =
  | { ok: true; tickets: { uploadId: string; url: string }[] }
  | { ok: false; error: string }

/**
 * Check the challenge and issue upload URLs.
 *
 * The token is spent here, at the point the capability is granted, rather than
 * when the files are handed over afterwards. Verifying later would mean the URLs
 * had already been issued and the bucket already writable.
 */
export async function startSubmission(input: {
  token: string
  count: number
}): Promise<SubmissionTicket> {
  if (!hasSubmissions) return { ok: false, error: "Submissions are not open at the moment." }
  if (!hasJobs) return { ok: false, error: "Submissions are not open at the moment." }

  if (!Number.isInteger(input.count) || input.count < 1) {
    return { ok: false, error: "Choose at least one file." }
  }
  if (input.count > MAX_SUBMISSION) {
    return {
      ok: false,
      error: `Up to ${MAX_SUBMISSION} files at a time, please. Send the rest in a second batch.`,
    }
  }

  const ip = (await headers()).get("cf-connecting-ip") ?? undefined
  const verdict = await verifyTurnstile(input.token, ip)
  if (!verdict.ok) return { ok: false, error: verdict.why }

  try {
    const tickets = await Promise.all(
      Array.from({ length: input.count }, async () => {
        const uploadId = randomUUID()
        return { uploadId, url: await presignUpload(stagingKey(uploadId)) }
      }),
    )
    return { ok: true, tickets }
  } catch {
    return { ok: false, error: "Could not prepare the upload. Try again shortly." }
  }
}

export type SubmissionResult = { ok: true; message: string } | { ok: false; error: string }

/**
 * Take one uploaded file into the pipeline.
 *
 * **Not Turnstile-checked again**, and that is deliberate rather than an
 * oversight: the token was spent issuing the URL, and a token is single use, so
 * there is nothing left to check. What guards this call is `stagingKey`, which
 * asserts its argument is a uuid — so the only files that can be adopted are
 * ones this server issued a URL for, and a crafted id cannot reach outside the
 * staging prefix or name an existing material's object.
 */
export async function finishSubmission(input: {
  uploadId: string
  filename: string
  title?: string
  /** Optional, and optional is the point. Recorded so a thank-you is possible. */
  from?: string
  note?: string
}): Promise<SubmissionResult> {
  if (!hasSubmissions || !hasJobs) {
    return { ok: false, error: "Submissions are not open at the moment." }
  }

  let key: string
  try {
    key = stagingKey(input.uploadId)
  } catch {
    return { ok: false, error: "That upload reference is not valid." }
  }

  const title = (input.title?.trim() || titleFromFilename(input.filename)).slice(0, 300)
  if (title.length < 2) {
    return { ok: false, error: "That file needs a name we can read." }
  }

  const materialId = await stageMaterial({
    /**
     * No actor. `audit_log.actor_id` is nullable and a submission genuinely has
     * no account behind it — writing one of ours in would be a false record of
     * who did this. Who sent it, if they said, is in the entry's payload.
     */
    actorId: null,
    title,
    source: "public_submission",
    stagingKey: key,
    categoryIds: [],
    submittedBy: input.from?.trim().slice(0, 200) || undefined,
    note: input.note?.trim().slice(0, 1000) || undefined,
  })

  await tasks.trigger<typeof processMaterial>("process-material", {
    materialId,
    stagingKey: key,
    title,
    source: "public_submission",
    actorId: null,
  })

  return {
    ok: true,
    message: `Thank you — “${title}” has been sent for review.`,
  }
}
