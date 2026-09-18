/**
 * What is configured, what is not, and what each one switches on.
 *
 *   pnpm env:check
 *
 * **It never prints a value.** Lengths and shapes only, so it is safe to paste
 * the output into a message or a ticket.
 *
 * It exists because `KEY=""` is indistinguishable from `KEY=…` to a quick look
 * and to a careless grep — `.env.example` ships empty placeholders, copying it
 * gives you every name with no value, and the result is a feature that silently
 * stays off. That is exactly how three credentials sat "present" and empty here.
 *
 * Where each one goes — Vercel, Trigger.dev, GitHub Actions — is in
 * `docs/RUNBOOK.md`, which is the answer to a different question: this says
 * whether it is set *here*.
 */

type Check = {
  name: string
  unlocks: string
  /** Everything after this is off without it. */
  required?: boolean
  /** Returns a complaint, or null when the value looks right. */
  shape?: (value: string) => string | null
}

const GROUPS: { title: string; note?: string; checks: Check[] }[] = [
  {
    title: "The archive itself",
    checks: [
      { name: "DATABASE_URL", unlocks: "everything", required: true },
      { name: "R2_ACCOUNT_ID", unlocks: "reading and writing files", required: true },
      { name: "R2_ACCESS_KEY_ID", unlocks: "reading and writing files", required: true },
      { name: "R2_SECRET_ACCESS_KEY", unlocks: "reading and writing files", required: true },
      { name: "R2_BUCKET", unlocks: "reading and writing files", required: true },
      { name: "R2_PUBLIC_BASE_URL", unlocks: "page images and downloads", required: true },
    ],
  },
  {
    title: "The app",
    checks: [
      {
        name: "BETTER_AUTH_SECRET",
        unlocks: "signing in",
        required: true,
        shape: (v) => (v.length < 32 ? "needs at least 32 characters" : null),
      },
      { name: "BETTER_AUTH_URL", unlocks: "signing in", required: true },
      {
        name: "NEXT_PUBLIC_SITE_URL",
        unlocks: "the sitemap, share links, invitation links",
        required: true,
      },
    ],
  },
  {
    title: "Processing what is added",
    note: "Without both, the add form says so rather than accepting a file it cannot process.",
    checks: [
      { name: "TRIGGER_SECRET_KEY", unlocks: "running the pipeline" },
      { name: "TRIGGER_PROJECT_REF", unlocks: "running the pipeline" },
    ],
  },
  {
    title: "Reading photographed pages",
    note: "Without it tesseract.js reads them instead — free, and worse. Goes to Trigger.dev, not Vercel.",
    checks: [{ name: "GOOGLE_CLOUD_VISION_KEY", unlocks: "Google Cloud Vision OCR" }],
  },
  {
    title: "Email",
    note: "Without both, an admin copies the invitation link by hand.",
    checks: [
      { name: "RESEND_API_KEY", unlocks: "sending invitations" },
      {
        name: "EMAIL_FROM",
        unlocks: "sending invitations",
        shape: (v) => (v.includes("@") ? null : "should contain an address"),
      },
    ],
  },
  {
    title: "Public submissions",
    note: "Without both, /submit is a short explanation rather than a form. Never partly on: the degraded state would be an unauthenticated write to the bucket.",
    checks: [
      { name: "NEXT_PUBLIC_TURNSTILE_SITE_KEY", unlocks: "the /submit page" },
      { name: "TURNSTILE_SECRET_KEY", unlocks: "the /submit page" },
    ],
  },
  {
    title: "Pulling from Drive",
    note: "All three, or /admin/sync explains it is not connected. Give the service account Viewer on the folder and nothing more.",
    checks: [
      {
        name: "GOOGLE_SERVICE_ACCOUNT_EMAIL",
        unlocks: "Drive sync",
        shape: (v) =>
          v.endsWith(".iam.gserviceaccount.com")
            ? null
            : "expected a …iam.gserviceaccount.com address",
      },
      {
        name: "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
        unlocks: "Drive sync",
        shape: (v) => {
          if (!v.includes("BEGIN PRIVATE KEY")) return "does not look like a PEM key"
          // A .env file cannot hold a real newline, so the JSON's \n must survive
          // as two characters. Without them `createSign` fails with a PEM error
          // that says nothing about the cause.
          if (!v.includes("\\n") && !v.includes("\n"))
            return "has no newlines — paste it with the \\n intact"
          return null
        },
      },
      { name: "GOOGLE_DRIVE_FOLDER_ID", unlocks: "Drive sync" },
    ],
  },
]

function main() {
  let missingRequired = 0
  let off = 0

  for (const group of GROUPS) {
    console.log(`\n${group.title}`)
    if (group.note) console.log(`  ${group.note}`)

    for (const check of group.checks) {
      const value = process.env[check.name] ?? ""
      const complaint = value ? (check.shape?.(value) ?? null) : null

      let mark: string
      if (!value) {
        mark = check.required ? "MISSING " : "not set "
        if (check.required) missingRequired++
        else off++
      } else if (complaint) {
        mark = "WRONG?  "
      } else {
        mark = "ok      "
      }

      const detail = value
        ? complaint
          ? `— ${complaint}`
          : `${value.length} chars`
        : `— ${check.unlocks} is off`

      console.log(`  ${mark}${check.name.padEnd(36)} ${detail}`)
    }
  }

  console.log("")
  if (missingRequired > 0) {
    console.log(`${missingRequired} required value(s) missing — the app will not run.`)
  } else if (off > 0) {
    console.log(`Everything required is set. ${off} optional value(s) are switching a feature off.`)
  } else {
    console.log("Everything is set.")
  }
  console.log("Where each one goes — Vercel, Trigger.dev, GitHub Actions — is in docs/RUNBOOK.md.")
}

main()
