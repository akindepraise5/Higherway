# Status

Living record of where Higherway v2 stands. Update it in the same change as the work.

**Updated:** 2026-09-16
**Now:** Phase 2 — the public site is built and serving real data; backfill still running
**Branch:** work happens on `v2`; `main` keeps serving the current site until v2 matches it

---

## Where things stand

| | |
|---|---|
| Docs | `CLAUDE.md`, `ARCHITECTURE.md`, `STATUS.md` written |
| Code | Phases 0 and 1 on the `v2` branch. `main` still serves v1 |
| Database | Live on Neon. 8 tables, `pg_trgm` 1.6 and `vector` 0.8.6, 651 materials, 69 categories |
| Files | Moving into R2 bucket `higherway`, served from `cdn-higherway.mavilletech.com` |
| Materials | 651 in the spreadsheet, all with a valid Drive link, ~3.5 GB |
| Categories | 69 real topics found; 367 materials (56%) have none |
| Duplicates | 62 exact-title groups covering 132 rows; 69 groups ignoring case and punctuation |
| Decided | R2 is the truth, sync is manual and one-way, OCR is free (see `ARCHITECTURE.md` §13) |

---

## Needed from the owner

Free accounts — dummy values sit in `.env.example` until these arrive. None of them
block the start of the work.

- [x] Neon database — live, migrated
- [x] Cloudflare R2 bucket + credentials — live, receiving files
- [x] Resend API key
- [x] Owner email for the seeded account
- [ ] Trigger.dev
- [ ] PostHog
- [ ] Google service account, with **read** access to the Drive folder
- [x] Drive folder ID — `1Cx9XJ-8lsnvjBxpK59HnYfp_dZZUpb9D` (needed at Phase 6; the
      migration itself works off the public links)
- [x] R2 bucket `higherway`, served from `cdn-higherway.mavilletech.com`
- [ ] Email address for the first Owner account
- [ ] Sender address for invites (a verified `mavilletech.com` address)
- [ ] Cloudflare account ID + Workers AI token — free, and powers the title, summary and
      category suggestions
- [ ] Decide on Google Cloud Vision for server-side OCR: 1,000 pages/month free covers
      us forever, but Google wants a card on file even at zero spend. Declining costs
      nothing — tesseract.js takes over automatically

**Domain — resolved.** `mavilletech.com` is on Cloudflare and verified in Resend, so
invite emails deliver and R2 can have a custom domain from the start. The project's own
domain comes later and costs only a DNS change plus a few environment variables. The
public site stays on the Vercel URL until then, deliberately — see `ARCHITECTURE.md` §3.

---

## Phases

### Phase 0 — Foundation
- [x] `ARCHITECTURE.md`, `CLAUDE.md`, `STATUS.md`
- [x] Next.js 16.3 + React 19 + TypeScript strict + Tailwind 4, pnpm, on branch `v2`
- [x] Design tokens carried over from v1 (paper, ink, forest, gold), Newsreader +
      Instrument Sans wired through `next/font` to the token variables
- [x] `docs/legacy/index.html` — v1 kept for reference
- [x] `.env.example` with every key, including the R2 bucket and Drive folder
- [x] Biome, Vitest, Playwright configured — `lint`, `typecheck`, `test`, `build` green
- [x] shadcn/ui initialised, with its semantic tokens mapped onto the Higherway palette
- [x] CI workflow: lint, typecheck, test, build on every push

Notes for whoever picks this up:

- `create-next-app` generates its own `AGENTS.md` and a `CLAUDE.md` that points at it.
  That has been reversed — `CLAUDE.md` holds the content, `AGENTS.md` points to it.
- Biome needs `css.parser.tailwindDirectives` for Tailwind 4's `@theme`, and the
  reduced-motion block in `globals.css` carries a documented suppression for
  `noImportantStyles`: it must outrank component styles, which is the point of it.
- **`shadcn init` fights the design system.** It adds Geist bound to `--font-sans`
  (replacing Instrument Sans) and leaves `--background` as white oklch (replacing paper).
  Both were undone, and shadcn's tokens now point at the palette, so a generated
  component is on-brand immediately. If anyone re-runs `init`, check `layout.tsx` and
  the `:root` / `@theme inline` blocks in `globals.css` afterwards.

### Phase 1 — Data and storage
- [x] Drizzle schema (`ARCHITECTURE.md` §5) — 8 tables, migrations generated.
      `0000_extensions` creates `vector` and `pg_trgm`; `0001` builds the tables
      against them. Partial unique indexes keep slug and checksum unique among
      **live** rows only, so archiving a duplicate needs no renaming.
- [x] Pure primitives in `src/lib`, with tests (landed early — they need no
      credentials, and the pipeline is built on them):
      - `dedupe/title` — normalising and comparing titles
      - `dedupe/score` — combining signals into a verdict that explains itself
      - `text/similarity` — shingle overlap, survives OCR noise; containment
        catches an article reprinted inside a booklet
      - `text/quality` — scores an OCR read, feeding the re-read queue
      - `text/chunk` — chunking for embeddings, keeping page numbers
- [x] R2 storage keys (`lib/r2/keys`, pure and tested) and the client
      (`server/r2/client` — it reads the environment and the network, so it sits
      in `server/`, not `lib/`). Presigned uploads go browser → R2 directly,
      because Vercel caps request bodies at 4.5 MB and 8.6% of this archive is
      over 10 MB.
- [x] `lib/sheet/csv` — the v1 CSV parser carried over, with column mapping and
      placeholder-topic handling, tested against the real header row
- [x] `lib/slug` — stable URLs, with numbering for the titles that genuinely
      repeat (one appears three times)
- [x] `scripts/import-sheet.ts` — seeds records and categories. Idempotent:
      matches on Drive file id, so re-running imports only what is new.
      **Run 2026-09-16**: 651 materials and 69 categories imported, 327 category
      links across 284 materials, 367 left Uncategorised. Filename titles cleaned
      (`2018-07-Classics-The-Essence-of-True-Christianity` → "The Essence of True
      Christianity"), and the title appearing three times got three distinct URLs.
- [x] `lib/pdf` — renders pages to WebP and pulls out embedded text. **Verified
      on real archive files**: a born-digital sample gave 13,256 characters of
      text and needs no OCR at all; a phone-photo sample gave none, as expected.
      220–273 KB per page, ~0.4–0.6s to render one.
- [x] `scripts/backfill.ts` — Drive → R2, renders pages, takes embedded text,
      publishes. Resumable: what is already in R2 is skipped, so an interrupted
      run continues rather than restarting. **Written but never run** — needs
      `DATABASE_URL` and the four `R2_*` values.
- [x] Local embeddings (`server/embed`, `bge-small-en-v1.5`) and the pure
      comparison helpers (`lib/vector`). **Verified**: 384 dimensions,
      normalised, ~1 ms per document after a one-time 43-second model download.
      Runs entirely on our own machine — no API, no quota, nothing sent anywhere.

101 tests passing. Nothing in Phase 1 has been executed against a real database
or bucket yet — that waits on `DATABASE_URL` and the four `R2_*` values.

Auth tables are deliberately **not** hand-written: Better Auth generates them in
Phase 3. `audit_log.actor_id` therefore has no foreign key yet; it is added in
that phase's migration.

### Phase 2 — Public site on the new data
- [x] Home, library, topic pages and about — all server-rendered from Neon
- [x] Covers ported to `lib/art/`, server-rendered SVG, unit tested for
      determinism: the same material must draw the same cover in a year, or
      people stop recognising it. Gradient ids are scoped per material, because
      two covers sharing one on a grid makes the second adopt the first's colours
- [x] Material page `/m/[slug]` with the in-browser reader — page images from R2,
      no PDF library shipped to the browser
- [x] Pagination: numbered pages with gaps, a range line, and a real URL for
      every state. v1 used infinite scroll with no addressable pages, which
      search engines could not follow. The window logic is pure and tested
- [x] Downloads save as the material's title, via `Content-Disposition` on the
      object — a cross-origin download ignores HTML's `download` attribute
- [x] Sitemap and robots, built from the database, and guarded so a production
      build without `NEXT_PUBLIC_SITE_URL` fails loudly rather than publishing
      localhost URLs for Google to crawl
- [x] Social images via `next/og`, reusing the cover artwork so a shared link
      looks like the material rather than a generic banner
- [x] Share panel on the material page. It shows what the other person will
      receive — title, topic, the plain link — before anything is sent, and every
      option hands off to the reader's own app; nothing is sent from the page and
      no tracking parameters are added. The link comes from
      `window.location.href`, so moving to the real domain needs no change here
- [x] v1's hero rail restored ("A brighter tomorrow always"), hidden below 900px
      exactly as v1 hid it. The nav's active underline was already carried over
- [x] One logo everywhere. The cover **plate** — the card on the home page,
      library and topic shelves — was laying the arc *beside* the word while
      every other surface put it above. Same lockup now in both variants
- [x] The sign-in page's logo links home, so someone who lands there by accident
      is not stuck editing the URL to leave
- [x] Redirects from the old `#/` links. This has to be a small inline script:
      a hash fragment is never sent to the server, so no redirect rule,
      middleware or rewrite can see it. It is the only client JavaScript on the
      public site, and it maps v1's `?cat=` to v2's `?topic=`
- [ ] Hybrid search (full text + fuzzy titles + meaning) — needs the OCR text

**Decided 2026-09-16:** the v1 archive publishes straight from the backfill, with
no review queue. These materials were already published in print and on the v1
site for years; holding them for approval would re-decide something the church
already decided. New uploads through the admin panel still go through review.

Verified against the running site: every route returns 200, both nonsense slugs
404, and the filters compose — 142 materials, 18 for "faith", 6 under Prayer,
4 for both together.

**The backfill has finished, and it did not finish cleanly.** 624 of 651 materials
are published with their file in R2 (1.95 GB). **27 are still `staged`**, and the
process exited 0 regardless — per-material failures were caught and counted rather
than raised, so the exit code says nothing about them.

Every one is accounted for, by hashing the bytes rather than reading the log:

| | |
|---|---|
| 24 | byte-identical to a material already live — `materials_sha256_live_idx` refusing a file the archive already holds |
| 1 | `5 keys for successful building` — Drive returns 404 |
| 1 | `Youths Without Blemish` — Drive served a sign-in page, not a PDF |
| 1 | `marks standard handbook for mechanical engineers` — never uploaded, and looks like it strayed into the Drive folder |

The 24 are the unique index doing its job, surfaced as a crash instead of a
decision. Nearly all match a live material with the *same title*, so the v1
spreadsheet lists the same Drive file twice. One does not: **"The Foundation of
Faith Rev. Darrel Lee" is byte-identical to "Document from Daniel Olorunmaiye"** —
one file under two titles, which is a human judgement, not a merge.

**Resolved 2026-09-16** by `pnpm resolve:stuck --apply`. 23 were archived against
the material they copy, each with a reason and a named actor, and their 73 MB of
unreferenced bytes removed — 86 objects. One was held back by the script's own
rule, because it is byte-identical to a material under a *different* title and
naming it is a judgement, not a script's decision. Three were left alone: they
have no file in R2 at all.

Checked afterwards rather than trusted: 23 archived rows each carry a
`duplicateOfId` and a `material.archive` entry, no archived material still owns
page rows, and **every surviving twin still has its file** — the one part of
that operation which could not have been undone.

The archive now stands at 628 live materials, 1.95 GB.

A lesson worth keeping: the run was started as `pnpm backfill | tail -40`, so all
but the last 40 lines of the record were thrown away. 7 of the 27 could not be
explained from the log at all and had to be reconstructed from R2. Long jobs
should be redirected to a file, never piped through `tail`.

Still to do, now unblocked:

- [x] `pnpm ocr:local --force` — **done**. 1,162 pages re-read in 2,177s
  (1.87s a page), none failed, so the corrected reading order is in the stored
  text and not only in the algorithm. Confirmed by reading a page back out of
  the database rather than re-running the recogniser over it. The archive now
  holds 2,223 pages of text out of 2,228: 1,162 read by Vision at an average
  quality of 0.979, and 1,066 taken straight from the PDFs.
- `pnpm fix:names` — running. The backfill was started before `putObject`
  learned to set the download name, so everything from that point landed
  without the header. Idempotent, so re-running costs nothing.
- [x] `pnpm scan:duplicates` — **done**, now that the text had settled. 628
  materials compared, 625 with usable text, **87 pairs raised: 49 likely, 38
  possible, every one `pending`**. Nothing was decided automatically, which is
  the point of it.

  These are a different class from the 23 the backfill left stuck. Those were
  byte-identical files — the same Drive file listed twice in the v1 sheet, caught
  by a checksum. These are the same teaching scanned or photographed on separate
  occasions, so no checksum could see them: "The anchor that holds" against "The
  Anchor that holds", "The cord of Salvation" against "The Cord Of Salvation",
  "Who's Right for Me" against "Who is right for me?". Waiting for a person at
  `/admin/duplicates`.
- **`TRIGGER_PROJECT_REF` is still missing** — only `TRIGGER_SECRET_KEY` is set,
  so `hasJobs` is false and adding a material is switched off. Deliberately: the
  file would upload and then sit in staging with nothing to process it.

### Phase 3 — Auth and admin shell
- [x] Better Auth, sign-up disabled, seeded Owner. Confirmed working from a real
      browser, not just by script
- [x] Invites: single-use hashed token, accept page, Copy-invite-link panel
      shown once. Email delivery is configured but the link is shown regardless,
      so the flow never depends on Resend
- [x] Roles: Owner ⊃ Admin ⊃ Editor. Only an Owner invites an Owner or Admin;
      the last Owner cannot be demoted or suspended
- [x] Audit log written inside every mutation — **this forced a second database
      handle**. Neon's HTTP driver has no transaction support at all, so
      mutations use a pooled WebSocket connection (`src/db/tx.ts`) where a real
      transaction works. Proved by probe: rollback leaves neither the change nor
      its audit entry
- [x] Admin layout, overview, materials list and detail, categories, People,
      Activity
- [x] Route guards in `src/proxy.ts` — verified both directions. No admin or
      sign-in link appears anywhere on the public site
- [x] Confirmation dialog for destructive actions, requiring the category's name
      to be typed where materials would move or be unfiled
- [x] Account menu: initials in the top-right with profile and sign-out under
      them, where every dashboard keeps it. It replaced a bare email and a flat
      sign-out link sitting side by side, which read as two unrelated pieces of
      furniture
- [x] `/admin/profile` — your own name and password. Gated at `requireSession`
      rather than higher: every role may edit their own account, while acting on
      someone else's stays in People. The name matters because it is what the
      audit trail and the materials table print against every change that person
      makes. A password change revokes other sessions, since it is usually a
      response to the password being seen by someone who should not have it

**Learned the hard way.** Category merge shipped behind a `<select>` that fired
on change, with no confirmation. A stray click moved 42 materials out of Faith.
It was reversible only because the v1 spreadsheet still records the original
filing — `mergeCategory` moves rows with an UPDATE, so afterwards a moved row is
indistinguishable from one that was always on the target, and the audit entry
records how many moved but not which. A category created after the import would
have been unrecoverable. `scripts/undo-merge.ts` performs the reconstruction;
the dialog is what stops it being needed again.

### Phase 4 — Managing materials
- [x] Categories: a search-or-create picker on the material page. It creates a
      topic inline when nothing matches, because sending an editor to Categories
      and back is how a material stays unfiled — and 367 of 651 are unfiled. It
      offers to create only when no topic matches exactly, so a near-duplicate
      is seen first. CRUD and merge shipped in Phase 3
- [x] Per-material history and contributor list, and a last-change column on the
      materials table: what changed, who changed it, when. Read from the audit
      trail rather than a column on the material — the trail is already written
      inside the same transaction as every change, so a `lastEditedBy` column
      would be a second record of the same fact, free to drift from it
- [x] Filing built for the backlog rather than for one material at a time: the
      cover and picker are sticky, so the pages scroll past while the picker
      stays put — deciding where something belongs means looking at it, not at
      its title. Each filed topic names who filed it and when, straight from
      `assignedBy` and `createdAt` on the join row, no new column. A **Next
      unfiled** link goes to the next one without a detour through the list
- [x] Material editor UI — title, author and summary, the public-text switch,
      and publish / take-out-of-the-library / restore. The services existed and
      audited every change; nothing called them, so a title imported from a
      filename could not be fixed without a database client. Correcting details
      is Editor work, moderating is Admin, and archiving asks for its reason in
      the dialog itself — a reason collected afterwards is one nobody writes
- [ ] Bulk actions on the materials table (filter and sort are done)
- [x] Upload (presigned) and import by URL, with the safety checks in §6. The
      file goes browser → R2 directly and never through the app, because Vercel
      refuses bodies over 4.5 MB and 8.6% of this archive is over 10 MB. A
      pasted link is checked as typed *and* after DNS resolves it, since a
      public-looking hostname can still point at a private address; redirects
      are refused outright, because a redirect lands somewhere the checks never
      saw. `lib/import/url-guard` is pure and tested — including the IPv4
      written as decimal, hex and octal that a dotted-quad check waves through
- [x] Reading a material while filing it: any page opens full size in a native
      `<dialog>`, with arrow keys and on-screen controls through the rest. The
      OCR text is deliberately not shipped to it — at ~3 KB a page a 48-page
      booklet would put 150 KB into the payload for a panel most visits never
      open
- [x] The trail says *which* topic and in which direction. Filing and unfiling
      were writing the same `material.categorise` action, so nothing could tell
      them apart and both read as "Topics changed"; unfiling is now
      `material.uncategorise` and entries read "Added to Faith" / "Removed from
      Faith", drawn from the payload rather than a new column. Filing no longer
      records the title, which made every entry look like a title edit
- [x] **Adding materials from the dashboard** — `/admin/materials/new`, by file
      or by link. Both doors lead to the same pipeline, so an uploaded material
      is indistinguishable from a backfilled one. **Runtime-gated**: without
      `TRIGGER_SECRET_KEY` the form says so rather than accepting a file it
      would leave sitting unprocessed in staging

### Phase 5 — Reading and duplicates
- [ ] OCR interface; tesseract.js on the worker
- [x] `scripts/ocr-local.ts` — macOS Vision, plus the re-read queue
- [x] **Reading order on multi-column pages** (`src/lib/text/columns.ts`). Vision
      returns lines in raster order, straight across the page, so a two-column
      spread came back with the columns woven together — the reason the stored
      text read "orn into a Muslim family, I was trained / Not wanting to keep
      the joy of the Lord to myself". `vision-ocr.swift` now emits each line's
      bounding box and a pure module rebuilds the order. Its own comment used to
      claim Vision "keeps the reading order right on two-column pages"; the
      archive's output disproved that.

      It took six attempts, and every wrong turn came from reasoning about the
      geometry instead of measuring it:
      - The gutter must be measured **once for the whole page**. Per band, a
        couple of wide lines close it and the page collapses to one column.
      - A gutter is identified by the **depth** of the drop, not its width.
        Coverage falls from 42 lines to 6 across a single 0.5% slice, because
        OCR boxes overshoot into the gap from both sides. Demanding a wide gap
        rejected a gutter that was plainly there.
      - A line counts as spanning when it **crosses** the gutter, not when it is
        wider than some guessed fraction — and the margin must be generous, or a
        byline set into the gap fragments the opening paragraph.
      - Vision occasionally merges one line across the gutter. Height cannot
        find it (1.17× median, *below* body lines at 1.34×); span can, because
        it alone covers the full text block. It is cut at the gutter rather than
        breaking the page, which would make the article read first column,
        second column, then first column again.

      Known residual: a drop cap Vision never emits stays lost, so a paragraph
      can still begin "orn into". Re-read Vision's own pages with
      `pnpm ocr:local --force` — which deliberately excludes the 1,071 pages
      whose text came from the PDF itself, since that text is exact and free.
- [ ] Quality scoring and flagging
- [ ] Duplicate engine: fingerprint, title, shingles, meaning
- [ ] Duplicate review page: clusters, keep one, never-again decisions
- [ ] Suggestions: categories, titles, summaries (free path first)

### Phase 6 — Sync
- [ ] Drive reader (read-only, service account)
- [ ] Sync button, progress, run history
- [ ] Held-back handling: duplicates, and files changed in Drive since import

### Phase 7 — Launch
- [ ] Analytics: Vercel, PostHog, Search Console
- [ ] Performance budget, accessibility pass, e2e tests
- [ ] Custom domain on R2, verified sending domain
- [ ] Cut `main` over from v1

### After launch
- [ ] Public submissions `/submit` with Turnstile (schema already supports it)
- [ ] Optional AI suggestions, if the free ones fall short
- [ ] Text-to-audio, as raised in early planning

---

## Open questions

- Domain name and timing — decides when invite emails and R2's public domain go live.
- Whether paid work is involved in building this, which decides Vercel Hobby vs Pro
  (`ARCHITECTURE.md` §3).
- Whether the free category suggestions are good enough, or the ~$5–10 language-model
  pass is worth switching on.
- How badly skewed and curved-spine photographs score once the whole archive has been
  read — only 8 pages were sampled.
- **Whether the embedding model is good enough for meaning-based search.** On three
  short synthetic snippets, the query "trusting God during sickness" ranked an
  unrelated text lowest (0.626) but separated the two related ones by only 0.018 —
  and put a generic faith text (0.747) above one explicitly about illness (0.729).
  Too little evidence to judge either way. Re-test against real material text once
  the backfill has run. If it disappoints, search still has full text and fuzzy
  titles to lean on, and a larger model is a schema change away (`vector(384)`).

---

## Log

**2026-09-16** — v1 read in full and measured: 651 materials, mixed born-digital PDFs,
CamScanner scans and phone photos. OCR bake-off run on real files: macOS Vision 0.73 s
per page at ~97–99%, tesseract.js 2.73 s at ~90–95% with scrambled columns. Free-tier
limits verified across the stack. Architecture decided and documented.

**2026-09-16 (later)** — The archive measured rather than assumed. 648 of 651 files
probed: **2.04 GB total**, mean 3.2 MB, median 2.11 MB. 25 sampled for page count:
**1.68 pages per document**, median 2, max 4 — so **~1,100 pages in the whole archive**,
a seventh of the working assumption. A large file means a high-resolution photograph,
not a long document (13.6 MB for 2 pages). Consequences: full-archive OCR is **13
minutes** on a Mac, R2 lands at **2.33 GB of 10 GB free**, and new uploads generate ~35
pages a month against Google Cloud Vision's 1,000-page free allowance.

Free-model research settled the AI question: **Cloudflare Workers AI** for titles,
summaries and categories — 10,000 neurons/day covers the backlog in about a day, and
their terms forbid training on our content. Gemini and Mistral free tiers rejected:
both train on free-tier content. Free vision-language models rejected for OCR: none is
an OCR engine and none is benchmarked on pages like ours.

**2026-09-16 (admin surfaces)** — Category assignment, per-material history, the share
panel, `/admin/profile` and v1's hero rail. Three mistakes worth recording, because all
three compiled and two would have gone unnoticed:

- `ACTION_LABEL` was typed `Record<string, string>`, so it happily held five audit
  actions that do not exist and omitted nine that do. It is typed to the `AuditAction`
  union now, which makes adding a case a compile error in that file.
- `setTextPublic` revalidated `/m/<id>`. The public route is keyed by slug, so it was
  invalidating a path that cannot exist.
- `contributors` declared `max(created_at)` as `sql<Date>`. A raw `sql<>` fragment has
  no column mapper, so it arrives as a string — caught by running the query against
  real data rather than trusting the type. Nothing reads the field yet; it would have
  thrown the first time anything called `.toISOString()` on it.

The share panel and hero rail were verified in a browser. The admin surfaces were not:
they need a sign-in, and the one in the tab was a password-manager entry for an
unrelated account. Their queries were exercised directly against Neon instead.
