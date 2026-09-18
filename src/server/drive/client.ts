import { createSign } from "node:crypto"
import { env } from "../../lib/env"

/**
 * Reading the Google Drive inbox.
 *
 * **Drive is read-only, and that is the rule this project is built around.**
 * CLAUDE.md puts it first: no uploads, no renames, no deletions, ever. It is
 * enforced here in three ways rather than by intention — the OAuth scope
 * requested is `drive.readonly`, so a token issued from it *cannot* write; every
 * request this module makes is a GET; and there is no function here that could
 * express a write even if one were called.
 *
 * **No new dependency.** `googleapis` is a very large package for what is two
 * HTTP calls and an RS256 signature that `node:crypto` already does. A service
 * account JWT is a signed assertion exchanged for a bearer token, and that is
 * the whole protocol.
 *
 * Every function throws if the credentials are missing. Callers check `hasDrive`
 * first; that flag has existed in `src/lib/env.ts` since Phase 1 with no reader,
 * and this is it.
 */

const SCOPE = "https://www.googleapis.com/auth/drive.readonly"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const FILES_URL = "https://www.googleapis.com/drive/v3/files"

/** Google caps a token at an hour; a minute of margin avoids a race at expiry. */
const TOKEN_TTL_SECONDS = 3600
const RENEW_MARGIN_MS = 60_000

const TIMEOUT_MS = 30_000

export type DriveFile = {
  id: string
  name: string
  /** Drive's own checksum. Null for a Google-native file, which we never take. */
  md5Checksum: string | null
  size: number | null
  modifiedTime: string | null
}

const base64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

let token: { value: string; expiresAt: number } | null = null

/**
 * A bearer token, minted from the service account key and cached until it is
 * nearly expired.
 *
 * The private key reaches us in one of two shapes and both have to work.
 * Verified rather than assumed: Node's `--env-file` parser expands `\n` inside a
 * double-quoted value, so a key loaded from `.env.local` arrives with **real**
 * newlines; typed into the Vercel or Trigger.dev dashboard it keeps the
 * **two-character** escapes. The replace below fixes the second and is a no-op
 * on the first. Without it, `createSign` fails with a PEM routines error that
 * says nothing about the cause.
 */
async function accessToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt - RENEW_MARGIN_MS) return token.value

  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n")
  if (!email || !key) throw new Error("Drive is not configured")

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claims = base64url(
    JSON.stringify({
      iss: email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    }),
  )

  const signature = base64url(createSign("RSA-SHA256").update(`${header}.${claims}`).sign(key))

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(
      `Google refused the service account (${response.status}). ${detail.slice(0, 200)}`,
    )
  }

  const json = (await response.json()) as { access_token?: string; expires_in?: number }
  if (!json.access_token) throw new Error("Google returned no access token")

  token = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? TOKEN_TTL_SECONDS) * 1000,
  }
  return token.value
}

/**
 * Every PDF in the inbox folder.
 *
 * Paged, because `files.list` returns 100 at a time by default and this archive
 * is 651 files — asking once and taking what comes back would silently see the
 * first hundred and report the rest as absent, which reads as "nothing new".
 *
 * `trashed = false` matters: a file someone deleted in Drive still answers a
 * plain query, and re-importing something the church removed is precisely the
 * kind of thing a read-only inbox must not do.
 *
 * Google-native documents are excluded by asking only for `application/pdf`.
 * They have no `md5Checksum` and cannot be downloaded as bytes, only exported,
 * and exporting is a different operation with different failure modes.
 */
export async function listFolder(folderId: string): Promise<DriveFile[]> {
  const bearer = await accessToken()
  const files: DriveFile[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and mimeType = 'application/pdf' and trashed = false`,
      fields: "nextPageToken, files(id, name, md5Checksum, size, modifiedTime)",
      pageSize: "100",
      // A folder shared with the service account may live in a shared drive.
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    })
    if (pageToken) params.set("pageToken", pageToken)

    const response = await fetch(`${FILES_URL}?${params}`, {
      headers: { Authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      throw new Error(`Drive list failed (${response.status}). ${detail.slice(0, 200)}`)
    }

    const json = (await response.json()) as {
      nextPageToken?: string
      files?: {
        id: string
        name: string
        md5Checksum?: string
        size?: string
        modifiedTime?: string
      }[]
    }

    for (const file of json.files ?? []) {
      files.push({
        id: file.id,
        name: file.name,
        md5Checksum: file.md5Checksum ?? null,
        size: file.size ? Number(file.size) : null,
        modifiedTime: file.modifiedTime ?? null,
      })
    }

    pageToken = json.nextPageToken
  } while (pageToken)

  return files
}

/** One file's bytes. `alt=media` is a GET; there is no write path here. */
export async function downloadFile(fileId: string): Promise<Uint8Array> {
  const bearer = await accessToken()

  const response = await fetch(
    `${FILES_URL}/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(TIMEOUT_MS * 4),
    },
  )

  if (!response.ok) {
    throw new Error(`Drive download failed (${response.status})`)
  }

  return new Uint8Array(await response.arrayBuffer())
}
