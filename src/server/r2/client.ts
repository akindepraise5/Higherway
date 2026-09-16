import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

/**
 * The R2 client. Lives in server/ rather than lib/ because it reads the
 * environment and talks to the network, and lib/ does neither (CLAUDE.md).
 * The key scheme itself is pure and lives in src/lib/r2/keys.ts.
 *
 * R2 speaks S3, so the AWS SDK works unchanged. Two differences that matter:
 * the region is always "auto", and there is no charge for data leaving the
 * bucket — which is why files are served straight from the custom domain
 * rather than proxied through the app.
 */

let client: S3Client | null = null

function env(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is not set. Fill it in .env.local — see .env.example for where to find it.`,
    )
  }
  return value
}

export function r2(): S3Client {
  if (client) return client

  client = new S3Client({
    region: "auto",
    endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env("R2_ACCESS_KEY_ID"),
      secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    },
  })
  return client
}

export const bucket = (): string => env("R2_BUCKET")

/**
 * A URL the browser can PUT straight to. Uploads bypass the app entirely,
 * because Vercel refuses request bodies over 4.5 MB and 8.6% of this archive
 * is larger than 10 MB. ARCHITECTURE.md §6.
 */
export async function presignUpload(
  key: string,
  contentType = "application/pdf",
  expiresIn = 900,
): Promise<string> {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn },
  )
}

/**
 * A time-limited download link. Published files are served from the public
 * custom domain instead; this is for staged files, which are not public yet.
 */
export async function presignDownload(
  key: string,
  filename?: string,
  expiresIn = 900,
): Promise<string> {
  return getSignedUrl(
    r2(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ...(filename
        ? { ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, "")}"` }
        : {}),
    }),
    { expiresIn },
  )
}

export async function putObject(
  key: string,
  body: Uint8Array | Buffer,
  contentType: string,
): Promise<void> {
  await r2().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }),
  )
}

/** Used by the backfill to skip what is already uploaded, so it can resume. */
export async function objectExists(key: string): Promise<boolean> {
  try {
    await r2().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }))
    return true
  } catch {
    return false
  }
}
