# Runbook

Every script here acts on the **live archive**. Read the entry before running one.

Most take `--dry` or default to a dry run; where they do, look at the output before
applying. Several of the incidents recorded at the bottom of this file were caught
precisely because someone read a dry run first.

---

## Everyday

| Command | What it does |
|---|---|
| `pnpm dev` | Development server on :3000. Reads `.env.local` **at boot** — restart it after changing environment variables. |
| `pnpm build` | Production build. Must pass before any PR. |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | The three that gate a commit. |
| `pnpm test:e2e` | Playwright. Needs `npx playwright install` once. |
| `pnpm db:studio` | Browse the database. |

---

## Bringing material in

### `pnpm import:sheet`
Seeds records and categories from the v1 spreadsheet. **Idempotent** — matches on Drive
file id, so re-running imports only what is new. Run once, at the beginning.

### `pnpm backfill`
Drive → R2 → render → publish, for everything the sheet listed. **Resumable**: whatever is
already in R2 is skipped, so an interrupted run continues rather than restarting.

> **It exits 0 even when materials fail.** Per-material failures are caught and counted,
> so the exit code says nothing about them. Check `status = 'staged'` afterwards.

### `pnpm resolve:stuck [--apply]`
Settles materials the backfill left `staged`. Hashes each one's bytes; where it is
byte-identical to a material already live, archives it against that material with a reason
and an actor, then removes the orphaned R2 objects.

Only archives when the **titles match exactly** as well. A byte-identical match under a
different title is a mis-titling and a human judgement, so it is held back.

---

## Reading the pages

### `pnpm ocr:local`
Reads pages with macOS Vision. **Mac only** — it compiles `scripts/vision-ocr.swift`.
Roughly 0.5–1.5s a page.

| Flag | Reads |
|---|---|
| *(none)* | Pages never read — `ocr_engine = 'none'`. |
| `--redo` | Pages read by some *other* engine. |
| `--force` | Vision's own pages again. Use after changing reading order or de-hyphenation. |
| `--limit N` | A sample first. |

> `--force` **deliberately excludes `text_layer` pages.** That text came from the PDF
> itself — it is exact and free, and re-reading a photograph of it would be strictly
> worse.

**"Awaiting text" means never read, not "has no text".** A blank verso is read correctly,
holds nothing, and is finished. While the queue asked for empty text, five blank pages
came back every single run — "read 5 … still waiting 5", for ever.

**A new upload no longer waits for this.** `read-material` reads it on the server —
Google Cloud Vision when `GOOGLE_CLOUD_VISION_KEY` is set, tesseract.js otherwise.
`ocr:local` stays for the backlog and for upgrading a tesseract read, because macOS
Vision is still the best of the three.

### `pnpm ocr:status`
Read-only. Says what has no text and *why*, from anywhere — no Mac, no waiting.

It separates three different problems that all look like "no text":

- **waiting for a recogniser** — rendered, never read. `pnpm ocr:local` fixes it.
- **no page image** — the render failed or never ran, so no recogniser can ever help.
  This is a rendering problem wearing an OCR costume.
- **no pages at all** — ingest never finished. A different failure again.

Use it before starting a re-read, to see whether one is warranted. Until server-side
OCR exists, this is also how you find a photographed upload that arrived with nothing
searchable in it.

### `pnpm fix:hyphens [--engine <name>] [--apply]`
Rejoins words broken across a line in **stored** text. Needs no re-reading: it is a pure
transformation over text that already exists.

Use it for embedded text, which never passes through `readingOrder` and so never gets
de-hyphenated any other way. It cannot repair text where a hyphen was *kept* and the lines
already merged — that has no line break left to act on, and needs `ocr:local --force`.

### `pnpm fix:names`
Re-sets `Content-Disposition` on stored objects so a download saves under the material's
title rather than `original.pdf`. Idempotent; re-running costs nothing.

---

## Storage

### `pnpm r2:cors [--apply] [https://the-deployed-address]`
Writes the CORS rules that let the browser upload straight to the bucket.

**Adding a material could never work without this, and it presents as "the connection
failed".** The upload is a cross-origin PUT carrying `Content-Type: application/pdf`,
which is not on the CORS safelist, so the browser sends a preflight `OPTIONS` first. A
bucket with no rules answers that **403**, the PUT is never sent, and the page has
nothing to report but a failed connection. It looked like a bug in the form and was
configuration the bucket had never been given.

- **Reading was never affected.** Page images and downloads come from the custom domain
  as plain GETs with no preflight, which is why the public site has always worked.
- **Pass the deployed address as an argument.** The rules are built from
  `NEXT_PUBLIC_SITE_URL`, which on a development machine is `http://localhost:3000` — run
  locally without an argument and you write a policy that allows localhost and refuses
  production. The script prints the full list before writing and warns if only localhost
  is in it.
- It **replaces** the configuration rather than merging, so what the script holds is the
  whole intended policy.
- **The R2 token needs bucket-settings permission, not just object access.** An
  "Object Read & Write" token gets `AccessDenied` here. Either issue an Admin Read &
  Write token, or set the same rules by hand in the Cloudflare dashboard under
  R2 → the bucket → Settings → CORS policy.
- Verify by reading back: re-run without `--apply`.

---

## Meaning

### `pnpm embed [--topics] [--force] [--limit N]`
Chunks each material's text, embeds it locally, and stores the vectors — pipeline stage
5. Also gives every topic a vector from its name and sub-text.

Touches no R2 object, renders nothing, runs no recogniser: the inputs are already in
`material_pages.text`. Local model, ~33 MB, downloaded once and then read off disk — no
API, no account, no quota, nothing sent anywhere.

**~2 s per material.** The whole archive is about twenty minutes. Redirect it to a file:
`pnpm embed > embed.log 2>&1`. Do not pipe a long run through `tail` — that is how 7 of
the backfill's 27 failures became unexplainable.

- **Resumable.** Without `--force` it takes only materials that have text and no chunks,
  so an interrupted run continues and a re-run after new uploads does only the new ones.
- `--force` re-embeds everything. Needed after the stored text changes — `fix:hyphens`,
  an `ocr:local --force`, or a change to `lib/text/chunk`.
- `--topics` re-embeds just the topics. Seconds. Run it after adding or renaming one.
- `embedMaterial` **replaces**, never appends, so re-running cannot leave vectors of text
  that no longer exists sitting in the same index as the text that replaced it.

**A material with no text is not a failure.** It is counted as "had no text" and skipped:
a photographed PDF has nothing to embed until a recogniser has read it.

**Topics are counted excluding merged ones.** The first run reported 58, not the 69 in the
v1 sheet — 9 have been merged away and 2 deleted. That is the number being right, not a
bug, and it is the kind of difference worth checking rather than assuming.

---

## Duplicates

### `pnpm scan:duplicates [--titles] [--dry]`
Compares every material against every other and raises pairs for review. **Nothing is
resolved automatically.**

- A pair someone has ruled on never comes back.
- A pair still pending is re-scored, so running again after OCR improves earlier findings
  instead of leaving them frozen at their weakest.
- A pair that no longer qualifies is **withdrawn**, so the review page never offers a
  finding the scan has abandoned.

Run it **after** OCR, and after `pnpm embed` — the meaning signal needs the vectors and
silently scores 0 without them. On titles alone it flags "Exploring the word" against
"Exploring the word Sacrifice" — two articles in a series, not a copy.

**A new upload no longer needs this run by hand.** `enrich-material` scans the one
material it has just ingested against the rest, which is O(n) rather than the script's
O(n²). The script stays for the whole-archive pass, which is the only thing that can
*withdraw* a stale pair — a single-material scan knows nothing about the pairs between two
other materials, and withdrawing on that basis would delete other findings on every
upload.

---

## Drive

### The Sync button — `/admin/sync`, Owner only
Pulls new PDFs out of the read-only Drive inbox. There is no script: it is a Trigger
task started from the page, because a folder of hundreds is far past any function
timeout and the run has to survive the browser closing.

**Press *Check the folder* first.** It is a dry run — it lists what would be pulled and
imports nothing. A sync adds material to a public archive that nobody has read yet.

- **Drive is never written to.** No uploads, no renames, no deletions. The OAuth scope
  asked for is `drive.readonly`, so a token minted from it could not write even if the
  code tried. **Give the service account Viewer on the folder and nothing more** — with
  Editor, the only thing between this project and a write is the code rather than the
  permission.
- **One run at a time.** Two over the same folder would both see the same file as new and
  stage it twice, which the SHA-256 index then rejects as a crash rather than a skip —
  exactly how the backfill left 27 materials stuck.
- **A run that dies still closes its row.** If one is somehow left open it blocks the next
  press for ever; an Owner clears it from the page. Deliberately not a timeout — that
  would eventually clear a run that was merely slow and let a second start beside it.
- **Archived materials are never brought back**, and a file edited in Drive since import
  is **flagged, not re-imported**. Replacing a published material's bytes silently is an
  edit nobody asked for.
- Nothing publishes itself. Everything arrives waiting for a person, like any upload.

---

## People

### `pnpm reinvite`
Re-issues the first owner invitation. For when the seeded account's link has expired.

---

## Deploying

Production is `main`, built by Vercel. Background jobs run on Trigger.dev, which is
deployed separately. **The two do not share environment variables.**

| Where | Needs |
|---|---|
| **Vercel** | What the app reads: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_SITE_URL`, `R2_*`, `TRIGGER_PROJECT_REF`, and `TRIGGER_SECRET_KEY` as a **`tr_prod_…`** key |
| **Trigger.dev dashboard** | Its **own** `DATABASE_URL` and `R2_*`. Vercel's never reach it. Without them a deploy succeeds and every run fails at its first query |
| **GitHub → Actions secrets** | `DATABASE_URL`, because the CI build prerenders from the database · `TRIGGER_ACCESS_TOKEN`, a `tr_pat_…` personal token, which deploys the tasks |

The CI build's other values (`BETTER_AUTH_*`, `NEXT_PUBLIC_SITE_URL`,
`R2_PUBLIC_BASE_URL`) are literals in `ci.yml`. They are placeholders or public
hostnames, not secrets — do not replace them with real ones.

### Trigger.dev

Deploys automatically on every push to `main` via `.github/workflows/deploy-trigger.yml`.
To deploy by hand:

    pnpm exec trigger deploy

- **The binary is `trigger`, not `trigger.dev`.** `pnpm exec trigger.dev` finds nothing.
- **Never `npx trigger.dev@latest`.** It fetches whatever CLI is newest, and the CLI
  refuses to deploy against packages newer than itself. The CLI is a locked devDependency
  precisely so it always matches `@trigger.dev/sdk`.
- **`TRIGGER_SECRET_KEY` on Vercel must be `tr_prod_…`.** A `tr_dev_…` key sends runs to
  a developer's laptop, and they only process while that machine is on.

---

## Traps that have actually bitten

Each of these cost real time. They are here so they cost it only once.

**A script exiting 0 is not success.** The backfill finished "cleanly" while leaving 27
materials stuck. Always verify against the database.

**`material_pages` has no `updated_at`.** `created_at` stays at the backfill's timestamp
however many times the text is rewritten. It is not a progress signal.

**Don't invent an ordering.** `ocr-local.ts` selects its queue with no `ORDER BY`, so
Postgres returns rows in unspecified order. A "walk position" built on `row_number() over
(order by id)` is fiction, and conclusions drawn from it are worse than none.

**Count only what can reach zero.** "Pages ending a line with a hyphen" sat at exactly 671
for an hour while a re-read worked perfectly — 380 of them can *never* be joined, because
the word runs onto the next page or the line below is a folio line. The measure that works
is a trailing hyphen with a continuation beneath it.

**Postgres `\y` is not a word boundary you can trust here.** `'and re-ceived salvation' ~
'\yre-[[:alpha:]]'` returns **false**. `[[:<:]]`, the bare pattern and `LIKE` all return
true. Verify a pattern against a string you can read before believing its count.

**A correlated subquery built by interpolating a column object into a nested `sql`
template inside `.select()` silently matches nothing.** No error, no rows. It has caused
two separate bugs here — most recently every duplicate pair rendering as two blank cards.
Use separate queries and join in JavaScript.

**The S3 client has no timeouts by default.** Every one defaults to 0, which the SDK
documents as *disabled*. An unguarded `getObject` can wait for ever: one re-read sat at 0%
CPU for 53 minutes with no sockets and no error. `src/server/r2/client.ts` now sets them,
and `throwOnRequestTimeout` matters as much as the numbers.

**`pnpm build` leaves a running dev server serving stale code.** `next build` and
`next dev` share `.next/`. After any build — including the one the pre-push hook runs on
every `git push` — restart `pnpm dev`, or the browser shows code from before the change.
This cost an hour chasing a form field that was in the source the entire time.

**Finding a string in `.next/` says nothing about what the dev server serves.** Build
output lands in `.next/server/`; the dev server compiles to `.next/dev/`. That grep
"proved" the server was current when it was not.

**`env -i` does not hide `.env.local`.** Next reads it off disk. A "stripped" build run
that way quietly used every real value and certified the wrong variable list for CI. To
simulate CI, move the file aside — back it up first — and restore it unconditionally.

**Run `pnpm dev` in your own terminal.** A dev server started as an agent's background
task was reaped for low memory twice in a row while the machine had half its memory
free.

**A module-scope `process.env` throw breaks deploys that never query.** The Trigger.dev
indexer imports every task file with no environment, so a throw at import failed the
whole deploy with "There was an error importing task files" — naming neither the
variable nor the file. The database handles connect lazily for exactly this reason;
keep them that way.

**Only the newest invitation link works.** Sending a fresh link requires revoking the
old one, so every earlier link is withdrawn. The invite page used to say "expired" for
all four ways a link can fail; it now says which.

**Check one concrete row before trusting any aggregate.** Nearly every wrong turn above
shares this cause.
