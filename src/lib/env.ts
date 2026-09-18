import { z } from "zod"

/**
 * Environment validation — fail at boot rather than deep inside a request.
 *
 * The split matters: the first group is required for the app to run at all,
 * everything after it is optional and has a working fallback, because the
 * project must build and serve with no AI credentials, no email and no Drive
 * access (ARCHITECTURE.md §3).
 */

const schema = z.object({
  // Required everywhere. Nothing in this project does anything without it.
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  /**
   * Required by the **app**, and checked where they are used rather than here.
   *
   * This module is imported by the Trigger.dev tasks — `read-material` reaches
   * it through `server/ocr`, `sync-drive` directly — and **the Trigger indexer
   * imports every task file with no environment at all**. A `z.string().url()`
   * at module scope therefore threw during indexing and failed the entire
   * deploy with "There was an error importing task files", naming neither the
   * variable nor the file. RUNBOOK.md records that exact trap from a previous
   * occurrence; this is the same one, reached by a different road.
   *
   * Simulated rather than assumed: importing the four task files with only
   * `DATABASE_URL` and `R2_BUCKET` set throws on two of them, and does not once
   * these are optional here.
   *
   * Nothing is weakened. `lib/auth.ts` refuses to construct without the secret
   * and the URL, and every admin page and every mutation goes through it; the
   * sitemap and robots already refuse a production build with no site URL. The
   * check moved to where the value is needed — it did not disappear.
   */
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters")
    .optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),

  // Files. Required in practice, optional here so tests and CI can run dry.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.string().optional(),

  // Optional integrations, each with a fallback.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_AI_TOKEN: z.string().optional(),
  GOOGLE_CLOUD_VISION_KEY: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().optional(),
  GOOGLE_DRIVE_FOLDER_ID: z.string().optional(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  TRIGGER_SECRET_KEY: z.string().optional(),
  TRIGGER_PROJECT_REF: z.string().optional(),
  SEED_OWNER_EMAIL: z.string().email().optional(),
  SEED_OWNER_NAME: z.string().optional(),
})

export const env = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  R2_BUCKET: process.env.R2_BUCKET,
  R2_PUBLIC_BASE_URL: process.env.R2_PUBLIC_BASE_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_AI_TOKEN: process.env.CLOUDFLARE_AI_TOKEN,
  GOOGLE_CLOUD_VISION_KEY: process.env.GOOGLE_CLOUD_VISION_KEY,
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID,
  // Read as a literal so Next can inline it into the client bundle. A
  // `process.env[name]` lookup is not substituted at build time and arrives
  // undefined in the browser.
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
  TRIGGER_SECRET_KEY: process.env.TRIGGER_SECRET_KEY,
  TRIGGER_PROJECT_REF: process.env.TRIGGER_PROJECT_REF,
  SEED_OWNER_EMAIL: process.env.SEED_OWNER_EMAIL,
  SEED_OWNER_NAME: process.env.SEED_OWNER_NAME,
})

/**
 * Read a value the app cannot run without, failing with a message that says
 * which one.
 *
 * Used at the point of use rather than at import, so a background worker that
 * never touches authentication is not required to carry an auth secret.
 */
export function required<K extends keyof typeof env>(name: K): NonNullable<(typeof env)[K]> {
  const value = env[name]
  if (value === undefined || value === "") {
    throw new Error(`${String(name)} is not set. The app cannot start without it.`)
  }
  return value as NonNullable<(typeof env)[K]>
}

/** Invite emails can actually be delivered. Without it, admins copy the link. */
export const hasEmail = Boolean(env.RESEND_API_KEY && env.EMAIL_FROM)

/**
 * There is deliberately no `hasSuggestions` here.
 *
 * It existed from Phase 1 to Phase 5 and was read by nothing, because the
 * Cloudflare Workers AI client it gated was never written. Topic suggestions now
 * run on the local embeddings with no credentials at all
 * (`server/suggest/topics.ts`), so there is nothing left for it to gate. The
 * `CLOUDFLARE_*` variables stay in the schema: titles and summaries are still
 * unbuilt and Workers AI remains the plan for them, and a flag can come back
 * when something reads it.
 */

/**
 * Public submissions are switched on.
 *
 * **Both keys, or the page does not exist.** Submitting means handing an
 * unauthenticated visitor a presigned URL to our bucket, and doing that with no
 * abuse check is an open door to filling 10 GB of free storage with anything at
 * all. Every other flag here degrades to a worse-but-working state; this one
 * cannot, because the degraded state is "anyone may write to the bucket".
 */
export const hasSubmissions = Boolean(
  env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY,
)

/** Server-side OCR. Without it, tesseract.js reads new uploads instead. */
export const hasCloudOcr = Boolean(env.GOOGLE_CLOUD_VISION_KEY)

/**
 * Background jobs. Rendering a PDF runs off Vercel so it is not bounded by a
 * function timeout (ARCHITECTURE.md §3, §6). Without the key nothing can be
 * processed, so the upload form says so rather than accepting a file it will
 * silently leave sitting in staging.
 */
export const hasJobs = Boolean(env.TRIGGER_SECRET_KEY && env.TRIGGER_PROJECT_REF)

/** Drive sync, Phase 6. The app never writes to Drive either way. */
export const hasDrive = Boolean(
  env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
    env.GOOGLE_DRIVE_FOLDER_ID,
)
