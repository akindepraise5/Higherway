# Higherway, in about ten minutes

A public archive of a church publication. 651 materials — sermons, testimonies, teaching
articles — free to read in the browser and free to download. Behind it, an admin panel
where a small team adds material, files it under topics, and resolves duplicates.

It replaces a single-file v1 (`docs/legacy/index.html`) that read a public Google Sheet
and sent every click out to Google Drive.

---

## The one rule that explains most decisions

> **Postgres holds the records. R2 holds the files. Drive is a read-only inbox.**

Everything else follows. A material's *record* — title, topics, status, who changed what —
lives in Neon Postgres. Its *file* and every rendered page image live in Cloudflare R2.
Google Drive is where the original scans came from, and the application never writes to
it, ever.

---

## How a material comes to exist

Three routes, one pipeline. Whatever the source, the finished material is
indistinguishable.

```
  a Drive file          an admin's upload           a pasted link
  (scripts/backfill)    (browser → R2 direct)       (server fetches it)
         │                      │                          │
         └──────────────────────┴──────────────────────────┘
                                │
                      src/server/ingest.ts
                                │
   SHA-256 → refuse an exact copy, naming the one already here
   create the row + file its topics          (one transaction, audited)
   render every page to WebP with mupdf + sharp        → R2
   take the PDF's embedded text if it has any
   write material_pages, set status = review  (one transaction, audited)
```

The slow middle deliberately sits **outside** any transaction. `src/db/tx.ts` pools three
connections, and holding one open across a 13 MB upload would block every other mutation
in the app behind a file transfer.

**A photographed PDF arrives with no text.** Only PDFs carrying their own text layer are
readable immediately. The rest wait for OCR — see `docs/RUNBOOK.md`.

---

## Why the text matters so much

Most of this archive is *photographs of printed pages*. Without OCR there is nothing to
search, and nothing for Google to index — the material may as well not be online.

So a lot of care goes into the text being right:

- **Reading order.** macOS Vision returns lines in raster order, straight across the page,
  which on a two-column magazine spread weaves the two columns together.
  `src/lib/text/columns.ts` rebuilds the true order from each line's geometry.
- **Broken words.** Justified columns split words across lines — "admis-" / "sion".
  `src/lib/text/dehyphenate.ts` rejoins them, because nobody can search for "admission"
  when the archive stores two halves. It knows to leave `one-third`, wrapped URLs and
  `down-to-earth` alone.
- **Quality scoring.** Every page carries a score, so a bad read is visible at the page
  that caused it rather than as one number for the whole document.

Both modules are pure and heavily tested, because the awkward cases — a byline set into
the gutter, a word running onto the next page — are impossible to reason about reliably
and easy to assert on.

---

## The shape of the code

```
src/
├── app/(public)/     home, library, topics, /m/[slug] — server-rendered, no app JS
├── app/admin/        the panel: materials, categories, duplicates, people, activity
├── proxy.ts          route guards (Next 16's name for middleware)
├── lib/              pure. no database, no network, no env. heavily tested.
├── server/           the database, the network, the environment
│   └── services/     every mutation, each audited in the same transaction
├── trigger/          Trigger.dev tasks — PDF work, off Vercel
└── db/               schema, migrations, and two handles (see CLAUDE.md)
```

**`lib/` being pure is load-bearing**, not stylistic. Duplicate scoring, cover art, text
handling and the URL guard are all testable with no infrastructure at all, which is why
they have real test coverage and the rest leans on them.

---

## Running it locally

```bash
pnpm install
cp .env.example .env.local     # then fill it in; every key says where to get it
pnpm db:migrate
pnpm db:seed                   # categories + the first owner account
pnpm dev
```

Adding a material also needs a Trigger.dev worker running in a second terminal:

```bash
npx trigger.dev@latest login
npx trigger.dev@latest dev
```

Without it, an upload lands in R2, queues a run, and nothing processes it — while the form
looks as though it worked.

---

## Things that will surprise you

- **Two database handles.** Reads use `db`; every mutation uses `txdb`. The HTTP driver
  cannot do transactions and does not say so.
- **Uploads never pass through the app.** Vercel caps request bodies at 4.5 MB and 8.6% of
  this archive is larger than 10 MB, so the browser PUTs straight to R2 with a presigned
  URL.
- **Slugs and checksums are unique among *live* rows only.** Archiving a duplicate needs
  no renaming.
- **"Uncategorised" is not a category.** It is the absence of rows in
  `material_categories`.
- **Nothing is deleted.** Archiving is reversible and audited.
- **The admin panel is not linked from anywhere public**, and `src/proxy.ts` bounces
  signed-out visitors.

---

## Where to look

| Question | File |
|---|---|
| Why is it built this way? | `docs/ARCHITECTURE.md` |
| What is done, what is next? | `docs/STATUS.md` |
| How do I run the data scripts safely? | `docs/RUNBOOK.md` |
| What are the rules for changing code? | `CLAUDE.md` |
| What did v1 look like? | `docs/legacy/index.html` |
