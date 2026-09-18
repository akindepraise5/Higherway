/**
 * Put a downloaded service-account JSON into `.env.local`, correctly escaped.
 *
 *   pnpm service:account ~/Downloads/higherway-sync-abc123.json
 *
 * **Because the private key is the part that goes wrong.** In the JSON it is one
 * string with `\n` escapes in it:
 *
 *   "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvg…\n-----END…-----\n"
 *
 * A `.env` line cannot hold a real newline, so the key is written here as one
 * line with those two-character `\n` sequences intact. Pasting it by hand
 * through a JSON viewer or an editor that "fixes" the string turns them into
 * real line breaks, and the value silently becomes only its first line —
 * `createSign` then fails with a PEM routines error mentioning neither the
 * variable nor the newline.
 *
 * **Both forms end up working, and it is worth knowing why.** Checked rather
 * than assumed: Node's `--env-file` parser *expands* `\n` inside a double-quoted
 * value, so what this writes as two characters is read back as a real newline.
 * On Vercel and Trigger.dev, where the value is typed into a field rather than
 * parsed from a file, it stays as two characters. `server/drive/client.ts`
 * normalises either way, which is why pasting the key into those dashboards
 * works whichever shape it arrives in.
 *
 * **It never prints the key.** It reports which variables it set and how long
 * they are, so the output is safe to paste into a message.
 *
 * **It does not touch the file beyond those two lines** — it replaces them if
 * they are there and appends them if they are not, leaving every other line
 * exactly as it was.
 *
 * The email is the only part that leaves this machine: it is what you share the
 * Drive folder with, as **Viewer**. The private key is shared with nothing, ever.
 */

import { readFileSync, writeFileSync } from "node:fs"

const ENV_FILE = ".env.local"

const KEYS = {
  client_email: "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  private_key: "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
} as const

function setLine(contents: string, name: string, value: string): { next: string; added: boolean } {
  // Quoted, because the private key contains characters a shell would otherwise
  // read. Any existing quotes in the value are escaped rather than trusted.
  const line = `${name}="${value.replace(/"/g, '\\"')}"`
  const pattern = new RegExp(`^${name}=.*$`, "m")

  if (pattern.test(contents)) return { next: contents.replace(pattern, line), added: false }
  return { next: `${contents.replace(/\n*$/, "\n")}${line}\n`, added: true }
}

function main() {
  const path = process.argv[2]
  if (!path) {
    console.error("usage: pnpm service:account <path-to-downloaded.json>")
    process.exit(1)
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>
  } catch (error) {
    console.error(`Could not read ${path}: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }

  if (parsed.type !== "service_account") {
    console.error(
      `That file is not a service account key (its "type" is ${JSON.stringify(parsed.type)}).\n` +
        "Download it from Google Cloud → IAM & Admin → Service Accounts → Keys → Add key → JSON.",
    )
    process.exit(1)
  }

  const email = String(parsed.client_email ?? "")
  const privateKey = String(parsed.private_key ?? "")

  if (!email.endsWith(".iam.gserviceaccount.com")) {
    console.error(`client_email does not look right: ${email || "(missing)"}`)
    process.exit(1)
  }
  if (!privateKey.includes("BEGIN PRIVATE KEY")) {
    console.error("private_key is missing or does not look like a PEM key.")
    process.exit(1)
  }

  /**
   * Real newlines become the two characters `\` and `n`. `JSON.parse` above has
   * already turned the file's escapes into real line breaks, and a `.env` line
   * cannot carry one — so they go back. `server/drive/client.ts` reverses this
   * before signing.
   */
  const escaped = privateKey.replace(/\r?\n/g, "\\n")

  let contents = ""
  try {
    contents = readFileSync(ENV_FILE, "utf8")
  } catch {
    console.log(`${ENV_FILE} does not exist yet — creating it.`)
  }

  let added = 0
  let replaced = 0
  for (const [field, name] of Object.entries(KEYS)) {
    const value = field === "client_email" ? email : escaped
    const result = setLine(contents, name, value)
    contents = result.next
    if (result.added) added++
    else replaced++
  }

  writeFileSync(ENV_FILE, contents)

  console.log(`\nWritten to ${ENV_FILE} — ${replaced} replaced, ${added} added.`)
  console.log(`  ${KEYS.client_email.padEnd(36)} ${email}`)
  console.log(`  ${KEYS.private_key.padEnd(36)} ${escaped.length} chars, newlines escaped`)
  console.log(`\nNow share the Drive folder with that address, as Viewer — not Editor.`)
  console.log("The private key is shared with nothing. Check it with: pnpm env:check")
}

main()
