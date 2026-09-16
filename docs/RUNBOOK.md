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

## Duplicates

### `pnpm scan:duplicates [--titles] [--dry]`
Compares every material against every other and raises pairs for review. **Nothing is
resolved automatically.**

- A pair someone has ruled on never comes back.
- A pair still pending is re-scored, so running again after OCR improves earlier findings
  instead of leaving them frozen at their weakest.
- A pair that no longer qualifies is **withdrawn**, so the review page never offers a
  finding the scan has abandoned.

Run it **after** OCR. On titles alone it flags "Exploring the word" against "Exploring the
word Sacrifice" — two articles in a series, not a copy.

---

## People

### `pnpm reinvite`
Re-issues the first owner invitation. For when the seeded account's link has expired.

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

**Check one concrete row before trusting any aggregate.** Nearly every wrong turn above
shares this cause.
