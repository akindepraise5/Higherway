import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
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

    /**
     * Without these the SDK waits forever. Every timeout below defaults to 0,
     * which the library documents as "disables the timeout", and a lost
     * response therefore leaves `await` pending with nothing left to settle it.
     *
     * That is not hypothetical: a re-read of 1,162 pages sat at 0% CPU for 53
     * minutes with no open sockets and no error, having silently stopped after
     * ~491 pages. The process was alive, the job was dead, and nothing said so.
     *
     * `throwOnRequestTimeout` matters as much as the number. Without it a
     * breach is only logged as a warning — the SDK keeps it opt-in because
     * `requestTimeout` was for a long time applied as a socket idle timeout —
     * so setting the timeouts alone would look like a fix and still hang.
     *
     * `socketTimeout` is the one that catches the failure seen here: a
     * connection that opened, then went quiet forever.
     */
    requestHandler: {
      connectionTimeout: 10_000,
      // Generous: the largest file in this archive is 13.6 MB, and these run
      // over a home connection.
      requestTimeout: 120_000,
      throwOnRequestTimeout: true,
      socketTimeout: 60_000,
    },

    // A dropped response should cost seconds, not a whole run.
    maxAttempts: 3,
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
  /**
   * What the browser should call the file when it saves it. A cross-origin
   * download ignores the HTML `download` attribute, so the name has to
   * travel with the object itself.
   */
  contentDisposition?: string,
): Promise<void> {
  await r2().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      ...(contentDisposition ? { ContentDisposition: contentDisposition } : {}),
    }),
  )
}

/**
 * Read an object back out of the bucket.
 *
 * Browser uploads go straight to R2 with a presigned URL, so the bytes never
 * pass through the app at all. Whatever renders and reads the file therefore
 * has to fetch it — there is no request body to work from.
 */
export async function getObject(key: string): Promise<Uint8Array> {
  const response = await r2().send(new GetObjectCommand({ Bucket: bucket(), Key: key }))
  if (!response.Body) throw new Error(`R2 returned no body for ${key}`)
  return response.Body.transformToByteArray()
}

/**
 * Remove an object.
 *
 * Deliberately narrow. Materials are never destroyed — archiving is a soft
 * state (CLAUDE.md) — so this exists for files no row refers to any more: a
 * rejected upload's bytes, or the copy left behind when a byte-identical
 * duplicate is archived and the surviving material already holds the same
 * bytes. It is not a way to delete a material's file out from under it.
 */
export async function deleteObject(key: string): Promise<void> {
  await r2().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
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
