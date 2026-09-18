/**
 * Let the browser upload straight to the R2 bucket.
 *
 *   pnpm r2:cors            show the rules the bucket has now
 *   pnpm r2:cors --apply    write the rules below
 *
 * **Why this exists.** Adding a material uploads browser → R2 with a presigned
 * URL, because Vercel refuses request bodies over 4.5 MB and 8.6% of this
 * archive is larger than 10 MB. A cross-origin PUT carrying
 * `Content-Type: application/pdf` is not a simple request — that content type is
 * not on the CORS safelist — so the browser sends a preflight `OPTIONS` first.
 * With no CORS rules on the bucket that preflight is answered **403**, the PUT
 * is never sent, and the only thing the page can say is "the connection failed".
 *
 * It looked like a bug in the upload form and was configuration the bucket had
 * never been given. Uploading has therefore never worked from a browser, from
 * the day it was written.
 *
 * Reading is unaffected and always has been: page images and downloads come from
 * the custom domain, which is a plain same-origin-less GET with no preflight.
 *
 * This writes to Cloudflare, not to Drive and not to the archive. It replaces
 * the bucket's CORS configuration wholesale — there is no merge — so what is
 * below is the complete intended policy, and `--apply` prints what was there
 * first.
 */

import { GetBucketCorsCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3"
import { bucket, r2 } from "../src/server/r2/client"

const args = process.argv.slice(2)
const apply = args.includes("--apply")

/**
 * Where an upload may come from.
 *
 * `NEXT_PUBLIC_SITE_URL` rather than a hardcoded address, so moving to the real
 * domain is a variable change and a re-run, not an edit here — the same reason
 * no URL is hardcoded anywhere else (ARCHITECTURE.md §3).
 *
 * **But that variable is whatever the machine running this happens to have**,
 * and on a development machine it is `http://localhost:3000`. Running this
 * locally would then write a policy that allows localhost and *not* production,
 * which fails in the one place it matters. So the deployed origins are named as
 * arguments, and every run prints the full list before writing it:
 *
 *   pnpm r2:cors --apply https://higherway.vercel.app
 *
 * localhost is always included: without it the add form cannot be exercised on a
 * development machine, which is how this went unnoticed in the first place.
 */
const origins = [
  ...new Set(
    [
      process.env.NEXT_PUBLIC_SITE_URL,
      "http://localhost:3000",
      "http://localhost:3005",
      ...args.filter((a) => a.startsWith("http")),
    ].filter((o): o is string => Boolean(o)),
  ),
]

const rules = [
  {
    AllowedOrigins: origins,
    /**
     * PUT to upload, HEAD and GET so a client can check an object it just
     * wrote. **No DELETE and no POST.** Nothing in the app deletes from the
     * browser — removing an object is a server action behind an Owner — and a
     * rule is the wrong place to grant a capability nothing uses.
     */
    AllowedMethods: ["PUT", "GET", "HEAD"],
    /**
     * `content-type` is the one that matters: the presigned URL is signed for
     * `application/pdf`, so the PUT has to send exactly that header, and a
     * header the rules do not allow is what the preflight refuses.
     */
    AllowedHeaders: ["content-type"],
    ExposeHeaders: ["ETag"],
    /** An hour. The preflight is then paid once per browser, not per file. */
    MaxAgeSeconds: 3600,
  },
]

async function main() {
  const client = r2()
  const Bucket = bucket()
  console.log(`bucket: ${Bucket}`)

  try {
    const current = await client.send(new GetBucketCorsCommand({ Bucket }))
    console.log("\ncurrent rules:")
    console.log(JSON.stringify(current.CORSRules ?? [], null, 2))
  } catch (error) {
    const name = error instanceof Error ? error.name : String(error)
    // R2 answers a bucket with no configuration by refusing, not by returning
    // an empty list, so this is the ordinary "never been set" case.
    console.log(`\ncurrent rules: none (${name})`)
  }

  console.log("\nrules to write:")
  console.log(JSON.stringify(rules, null, 2))

  if (!origins.some((o) => !o.startsWith("http://localhost"))) {
    console.log(
      "\nNote: only localhost is listed. Pass the deployed address as an argument,\n" +
        "      or production uploads will still be refused.",
    )
  }

  if (!apply) {
    console.log("\nNothing written. Re-run with --apply to write them.")
    return
  }

  await client.send(new PutBucketCorsCommand({ Bucket, CORSConfiguration: { CORSRules: rules } }))
  console.log("\nWritten. An upload from one of those origins will now be allowed.")
  console.log("Verify it rather than trusting it: re-run without --apply and read them back.")
}

main()
  .catch((e) => {
    console.error("failed:", e instanceof Error ? e.message : e)
    process.exit(1)
  })
  .then(() => process.exit(0))
