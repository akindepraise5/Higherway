# Status

Living record of where Higherway v2 stands. Update it in the same change as the work.

**Updated:** 2026-09-17
**Now:** v2 is live in production. Launch work is done — start at **Resume here**.
**Branch:** work on `v2` and open a PR into `main`. Vercel builds `main`.

---

## Resume here

Read this first when coming back. Everything below it is history and reasoning.

### Where it stopped

- **Production runs `main`**, built by Vercel. v2 was merged in PR #5 (`f5624b2`).
- **`v2` is a few small commits ahead of `main`:** the "Account deleted" activity-log
  label and these docs. Harmless — merge them with the next PR. `git log main..v2`
  lists them.
- The working tree is clean.

### Check these first — only the owner can

1. ~~Did the Trigger.dev deploy succeed?~~ **Confirmed working** by the owner on
   2026-09-16, after the project-ref fix (`1c2e7b7`) shipped in PR #5. The automatic
   deploy on push to `main` is now trusted.

   Note what that does *not* prove: a deploy succeeds even when the Trigger.dev
   dashboard is missing `DATABASE_URL` and `R2_*`, and runs only fail once they first
   query. Item 3 below is the check that proves runs work.
2. **Is CI green?** The build prerenders from the database, so it needs the repository
   secret `DATABASE_URL`.
3. **Add a material in production, end to end** — upload it, watch it process, see it
   appear. This has never been verified live, and it is now the one check that proves
   Trigger.dev runs can actually reach the database and R2 — a successful deploy does
   not. If the upload is accepted but the material never appears, the Trigger.dev
   dashboard is missing its own `DATABASE_URL` or `R2_*`.
4. **There are three Owners.** `n***@gmail.com` (the original), `d***@gmail.com` and
   `a***@gmail.com`. Owner can change anyone's role and restructure every topic; if the
   last two should be Admin or Editor, change it in People.

### Next, in the order worth taking them

1. **Invitation email.** Nothing is sent — admins copy the link by hand. `resend` is not
   a dependency, and `RESEND_API_KEY` is read into `hasEmail` and never used.
2. **OCR for new uploads.** A photographed PDF added from the dashboard has no
   searchable text until someone runs `pnpm ocr:local` on a Mac. `pnpm ocr:status`
   reports what is waiting.
3. **Embeddings — pipeline stage 5.** Built and tested, never connected: 0 chunks are
   stored. It unlocks auto-filing for the 340 unfiled materials, meaning-based search,
   and the duplicate scan's meaning signal. The four steps are written up under Phase 5.
4. **Search relevance.** "prayer" matches 59% of the archive, and nothing is ranked.
5. **Audit the invitation flow.** Creating an account and accepting an invitation write
   no audit entry, which CLAUDE.md requires of every mutation.
6. **Show why a material was archived, and what it duplicates.** Both are stored;
   neither is displayed anywhere in admin.
7. **Public submissions** — a short form and batch upload. The constraints are under
   *After launch*.
8. **Drive sync, Phase 6** — blocked on a Google service account with read access.

---

## Where things stand

Measured against the live database on 2026-09-16, late — not remembered. Several of
these moved during that same evening: 17 duplicate pairs were merged between 20:11 and
20:39, which is what took published from 624 to 607.

| | |
|---|---|
| Production | v2 on `main`, built by Vercel. Trigger.dev deploys on every push to `main` |
| Docs | All in `docs/`, entered through `CLAUDE.md` at the repo root: `ONBOARDING`, `ARCHITECTURE`, `STATUS`, `RUNBOOK`, plus a `README` |
| Materials | 651 rows · 611 live · **607 published** · 4 staged · 40 archived |
| Filing | **340** published materials have no topic |
| Authors | 2 published materials are credited |
| Text | 2,228 of 2,228 pages read (100%) |
| Duplicates | **64 pending** · 17 merged · 2 dismissed |
| Topics | 69, of which only 12 have sub-text |
| Accounts | 3, all Owner · none suspended · no open invitations |
| Embeddings | 0 chunks — stage 5 is not connected |
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
- [x] **Search no longer breaks on a line ending.** A reader searching
      "I had been brought up in a good home" got **nothing**, while "I had been
      brought up in a good" found it — which reads like a length limit and is
      not one. The page is stored one line per printed line (`readingOrder`
      ends with `.join("\n")`), so what is actually in the column is
      `"brought up in a good\nhome where "`. The search was
      `ilike '%…%'`, a literal substring match, and that substring genuinely
      does not exist: a newline sits where the reader typed a space.

      It hit every phrase long enough to wrap — which is every phrase anyone
      copies out of an article. Both sides now collapse whitespace, so a phrase
      is findable across whatever line break it happens to fall on, and
      `material_pages_text_trgm_idx` (migration `0003`) indexes the identical
      expression so it stays an index lookup rather than a scan of all 2,228
      pages. Verified against the running site: the full phrase returns the
      same 2 materials as the short one, where it returned 0.

      Worth noting for whoever adds hybrid search: this is the class of bug
      full-text search removes by construction, because a tsvector holds tokens
      and never sees the whitespace between them.
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
- [x] `pnpm fix:names` — **done**: 624 objects renamed, none failed, so a
  download now saves under the material's title rather than `original.pdf`.
- [x] **De-hyphenation carried into the stored text** — done, and it took three
  `--force` re-reads. The first attempt **hung after roughly 491 of 1,162 pages** —
  alive at 0% CPU, no sockets, no error — because the R2 client had no
  timeouts and an `await` could never settle. Fixed at the client, so the same
  silence cannot strand a Trigger task. Resumable by design: `--force` re-reads
  Vision's own pages, so the restart only repeats work already done.

  Two traps when judging progress, both of which cost me an hour:

  - `material_pages` has no `updated_at`, so `created_at` stays at the
    backfill's timestamp however often the text is rewritten. It is not a
    progress signal.
  - **Do not count pages that end a line with a hyphen.** Of 671 such pages,
    only **291 are joinable**; the other 380 cannot ever be fixed, because the
    word runs onto the *next page* or the line below it is a folio line —
    "18 Higher Way", "Scanned by CamScanner". That counter sat at exactly 671
    for an hour while the run worked perfectly, and I read its stillness as a
    fault three separate times.

    The measure that can actually reach zero is
    `text ~ '[[:alnum:]]-\n[a-z]'` — a trailing hyphen with a continuation
    line beneath it.
  - And **do not invent an ordering**. `ocr-local.ts` selects its queue with no
    `ORDER BY`, so Postgres returns rows in unspecified order. I built a
    `row_number() over (order by p.id)` "walk position" on top of that, declared
    the run had passed 153 dirty pages, and called it conclusive. It was
    nothing of the kind. The follow-up "damage is accelerating" was the same
    error compounded: counting `dirty AND pos <= done` while `done` rises
    widens the window over a fixed set, so the number climbs whether or not
    anything is wrong.

    Only order-independent totals mean anything here. By that measure the run
    was working the whole time: vision pages with a joinable split went 259 →
    232 while I was busy proving it broken.

  A **third** re-read was needed because the second one damaged the text. The
  list of prefixes held to be part of a word — `KEEPS_HYPHEN` — included `re`,
  `pre`, `co` and `ex`, so every ordinary word broken across a line at one of
  them kept its hyphen and had the two halves merged: 105 pages were left
  holding "re-ceived", "pre-sence", "ex-perience". Those four came out; only
  `self`, `anti` and `cross` remain, where the hyphen really does belong to the
  word. **1,162 pages re-read at 1.39s each, none failed.**

  Verified afterwards rather than assumed, because the obvious measure lies
  here: a count of `(re|pre|co|ex)-` pages cannot reach zero, since those
  letters begin real hyphenated words. 40 pages still match, and **all 19
  distinct hits are genuine English** — 13 `co-workers`, 8 `co-worker`, then
  `re-anchor`, `co-exist`, `co-operation`, `pre-teenage`, `ex-drunkards`,
  `re-consecrated` and the rest, one page each, summing to exactly 40. Not one
  broken word survives. **The stored text is final.**

- [x] **The archive is fully read: 2,228 of 2,228 pages have text (100%)** —
  1,066 taken straight from the PDFs, 1,162 read by Vision, 7 scoring below 0.5
  and worth a human look. Nothing is waiting for a recogniser.

  `pnpm ocr:status` reports this from anywhere, read-only, in a second. It
  exists because the only way to learn what was outstanding used to be to *run*
  `ocr:local`, which needs a Mac and twenty minutes. It separates three problems
  that all present as "no text": waiting for a recogniser, having no page image
  (a rendering failure, which no recogniser can help), and having no pages at
  all (ingest never finished).

  A caveat on the number, since this session was full of measurements that
  flattered themselves: `ocr:local`'s own footer printed "still waiting 5" when
  the third re-read ended. Those 5 no longer exist by direct query, and the
  arithmetic leaves no room for them — 1,162 + 1,066 is exactly 2,228. I have
  not explained where they went, only confirmed they are not there now.

- [ ] **3 live materials still have no pages at all**, all `staged`, all from
  the backfill and all already understood: `5 keys for successful building`
  (Drive returns 404), `Youths Without Blemish` (Drive served a sign-in page,
  not a PDF) and `marks standard handbook for mechanical engineers` (never
  uploaded, and appears to have strayed into the Drive folder). `resolve:stuck`
  deliberately left them alone — each needs a person to supply the file or
  remove the row, which is a judgement, not a script's decision.

- [x] **De-hyphenation never reached embedded text** — fixed. It lived inside
  `readingOrder`, and text taken from a PDF's own text layer bypasses that path
  entirely; `--force` excludes `text_layer` by design, so no amount of
  re-reading could ever have repaired those pages. `joinHyphenatedLines` and
  `dehyphenate` now live in their own pure module, `src/lib/text/dehyphenate.ts`,
  applied to both paths and testable without column geometry. `pnpm fix:hyphens`
  applies it to text already stored, which needs no recogniser at all.
  Archive-wide there is now **1 joinable split left**, down from 32.
- [x] `pnpm scan:duplicates` — **done**, and re-run once more after the third
  re-read, since changed text moves every shingle and containment score. 628
  materials compared, 625 with usable text, **83 pairs pending: 47 likely, 36
  possible**. The final pass raised 0 and withdrew 0 — it re-scored all 83
  against the settled text and found nothing new, which is the result that says
  the text and the scan now agree. Nothing was decided automatically, which is
  the point of it.

  These are a different class from the 23 the backfill left stuck. Those were
  byte-identical files — the same Drive file listed twice in the v1 sheet, caught
  by a checksum. These are the same teaching scanned or photographed on separate
  occasions, so no checksum could see them: "The anchor that holds" against "The
  Anchor that holds", "The cord of Salvation" against "The Cord Of Salvation",
  "Who's Right for Me" against "Who is right for me?". Waiting for a person at
  `/admin/duplicates`.

  Reading the weakest pairs found a systematic false positive worth fixing:
  **series**. "Questions and answers Vol 1" against "Vol 2" scored 0.510 purely
  on sharing three words of four, with no content evidence at all — and the
  trailing number is exactly what makes them different materials. Two titles
  alike in everything but a trailing number now score 0 on the title signal.
  Re-scored against the live pairs rather than argued in the abstract: 82 of 87
  unchanged, 4 dropped, every one a series. "Our Conscience is a Witness"
  against "…Witness1" survived, because 5 pages inside 48 is a containment
  finding and does not depend on the title.

  **Not** fixed, because it is a judgement rather than a rule: a shared series
  *prefix*, such as "Exploring the word Holiness" against "Exploring the word".
- **`TRIGGER_PROJECT_REF` is still missing** — only `TRIGGER_SECRET_KEY` is set,
  so `hasJobs` is false and adding a material is switched off. Deliberately: the
  file would upload and then sit in staging with nothing to process it.

### Phase 3 — Auth and admin shell
- [x] Better Auth, sign-up disabled, seeded Owner. Confirmed working from a real
      browser, not just by script
- [x] Invites: single-use hashed token, accept page, Copy-invite-link panel
      shown once. **This was marked done while it did not work, and was only
      fixed on 2026-09-16 after launch.** Recorded plainly because the
      checkbox is what hid it.

      **No invited person could ever join.** The two halves were written
      against different shapes: `db:seed` creates the Owner's *user row* and an
      invitation together, so accepting only attached a password to an account
      already there. Inviting from the admin panel created *only* the
      invitation and refused if an account existed. Accepting then looked for
      an account, found none, and failed with "That invitation no longer
      matches an account" — every time, for everyone. Measured: every
      admin-created invitation had no user row, and the database held exactly
      one account, the seeded Owner. It was the only account that ever could
      get in, which is why it looked like it worked.

      Accepting now creates the account when missing, with exactly the fields
      the seed uses — the one shape already proven to sign in. Verified by
      running that insert against the real schema inside a transaction, with a
      real invitation's role, then forcing a rollback: every constraint held, a
      duplicate submit was harmless, and nothing persisted.

      A second bug sat in front of it: the invite page said "This link has
      expired" for any failure. Of the six most recent invitations it showed
      that for five, and none had expired — four had been withdrawn when a
      newer link was sent, one already used. It now says which.

      **Email is not wired up**, despite the old wording here. `resend` is not
      a dependency and nothing sends; `RESEND_API_KEY` is read into `hasEmail`
      and never used. Admins copy the link by hand.

      Neither the account creation nor the acceptance writes an audit entry,
      which CLAUDE.md requires of every mutation. That gap predates this fix and
      runs through the whole accept flow; it is noted rather than silently
      widened.
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
- [x] **Adding materials from the dashboard** — by file or by link, from a
      drawer over the materials list. Both doors lead to the same pipeline, so
      an uploaded material is indistinguishable from a backfilled one.
      `/admin/materials/new` still renders the same form, so existing links keep
      working. **Runtime-gated**: without `TRIGGER_SECRET_KEY` *and*
      `TRIGGER_PROJECT_REF` the form says so rather than accepting a file it
      would leave sitting unprocessed in staging.

      The drawer will not close while an upload is in flight, Escape included.
      The browser PUTs straight to R2 and only then hands off to the job, so a
      drawer dismissed halfway would strand a file in staging with nobody aware
      of it.
- [x] Topics chosen **while** adding, not afterwards. Filing being a separate
      later step is how 367 of the 651 imported materials ended up with none.
      They travel with the file into the background task, so the material is
      filed in the same transaction that creates it, one audit entry per topic.
      Empty stays a real answer: "Uncategorised" is the absence of rows, not a
      category
- [ ] **Destroying a material** is deliberately absent. Archiving is reversible
      and covers the everyday case; CLAUDE.md reserves true destruction for an
      Owner as a separate, deliberate act. Building it means Owner-only gating,
      a typed-name confirmation, and removing the R2 objects in the same
      breath — an archived row whose file is already gone is worse than either
      outcome

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

**Stage 5 of the pipeline was never wired in.** `ARCHITECTURE.md` §7 lists
"5. Embed" between rendering and publishing, and every part of it is built and
unit-tested — but `src/server/embed/` has **zero importers in the repo**.
Nothing writes a vector: not `scripts/backfill.ts`, not `src/server/ingest.ts`,
not `src/trigger/process-material.ts`, not any service. So
`material_chunks.embedding` and `categories.embedding` are both empty, and
`src/lib/text/chunk.ts` has no non-test callers either.

Two consequences that look like separate gaps but are the same one:

- `scoreDuplicate` accepts a `meaning` signal (`lib/dedupe/score.ts`), and the
  scan never passes it — it silently defaults to 0. Every duplicate finding so
  far rests on titles and shingles alone.
- Library search is `ilike` over title, summary, author and page text
  (`server/materials/library.ts`). The comment there promising meaning-based
  search is waiting on the same vectors.

Also worth knowing: `hasSuggestions` in `src/lib/env.ts` gates a Cloudflare
Workers AI feature that **does not exist** — the flag is read nowhere, there is
no Workers AI client, and `src/lib/ai/` (described in `ARCHITECTURE.md`) has
never been created.

The free path needs no credentials and reuses what is already written. The
inputs are in the database now that `material_pages.text` is 100% populated, so
it is read → chunk → embed → insert: no re-render, no re-OCR, no R2 traffic.

1. Seed 69 `categories.embedding` values from name + blurb. Seconds.
2. `scripts/embed.ts` over the archive, storing a document-level chunk
   (`pageNumber: null`) as well as page chunks — the document vector is what a
   suggestion compares against. Minutes at ~1 ms a document. Resumable by
   skipping materials that already have chunks.
3. `nearest(doc, categories, 3)` from `lib/vector`, or `order by embedding <=> $1
   limit 3`. About 15 lines.
4. Accept/reject on the material editor; on accept write `material_categories`
   with `suggested` and `assignedBy`, matching the existing audit pattern.

**Do not trust it before looking at it.** The model was only ever judged on the
three synthetic snippets in Open questions below, where it ranked a generic
faith text *above* one explicitly about illness. Eyeball the top 3 on 20–30 real
materials first.

### Phase 6 — Sync
- [ ] Drive reader (read-only, service account)
- [ ] Sync button, progress, run history
- [ ] Held-back handling: duplicates, and files changed in Drive since import

### Requested 2026-09-17

Asked for directly, in the owner's words. The order is A → B → C → D, chosen
because the sync button in D is a button on top of four pipeline stages that were
never connected — pulling fifty photographed PDFs in through today's pipeline
would give fifty materials with no searchable text, no duplicate check beyond a
byte-for-byte match, and no topic. That is the 340-unfiled problem again, faster.

**A — done.**

- [x] **Admin tables scroll on a phone.** Every one of them sat in
      `overflow-hidden`, which does not shorten a wide table, it *clips* it: the
      right-hand columns were unreachable. The materials table went further and
      hid Topics, Pages, Text and Last change at `sm:`/`md:`/`lg:`, so on a phone
      the data did not exist rather than sitting off-screen. `TableScroll` now
      scrolls them horizontally with the first column pinned — a table you scroll
      sideways is only useful if you can still see which row you are on.

      Categories is deliberately not pinned: its first cell turns into the rename
      form, and a pinned form floating over the scrolling columns reads as a
      rendering fault.
- [x] **The share picture uses the real logo.** Three surfaces drew three
      different marks. `m/[slug]/opengraph-image.tsx` was not drawing the logo at
      all — a gold dash beside "HIGHERWAY" in uppercase sans. The other two had
      an arc over the word, but a deeper curve than the real one and set in
      whatever face the renderer defaulted to.

      All three now come from `src/server/og/brand.tsx`, which takes the arc
      straight from `components/public/logo.tsx` and sets the word in Newsreader.
      **Checked against a screenshot of the real logo rather than reasoned
      about**, which caught two errors that looked fine in isolation:

      - The SVG element was sized to the path's span, 53.4 units, ignoring that
        the 4-unit stroke overhangs it by 2 on each side. The whole arc was
        squeezed into that width: 0.263 of the word where the real mark is 0.290.
      - The gap has to be measured, not derived. In `logo.tsx` the arc and word
        share one coordinate space; here the word is a text node carrying its
        ascender as empty space the arc must clear. Left alone the arc landed
        *on* the capitals. It is 0.296 of the font size, and the rendered result
        is within a pixel of the real logo on both measures.

      Two things fell out of doing it: Satori was being given one font, so it set
      the topic label and strapline in the serif too — both faces are loaded now,
      sans first. And the scrim that keeps a title readable over a pale cover
      used `inset: 0`, **which Satori does not implement**: the div collapsed to
      nothing and the gradient had never drawn at all.

      The fonts are 155 KB of TTF in `assets/`, read off disk rather than
      fetched. `next.config.ts` traces them into the function bundle, because the
      material route is dynamic and the path is built at runtime.
- [x] **The topic picker is a select you can search, not a search that
      selects.** It was a bare input whose menu appeared only once you had typed:
      69 topics, none visible, no way to browse. Filing the backlog is the one
      job the material page exists for and it was asking people to remember shelf
      names. `TopicSelect` (Base UI's combobox, already a dependency) opens to
      the full list with counts, filters as you type, ticks what is already
      filed, and keeps the Owner-only inline create.

      **Clicked, not assumed** — driven in a mobile browser against a throwaway
      page: opening, filtering, arrow-and-Enter selection, deselection and
      creating all work, with nothing in the console. The one admin control with
      a measured mobile path.

**B — batch upload.** Per-file, not per-batch: the owner pointed out that a batch
can hold several authors, so author and topics belong on each queued file with an
"apply to all" as a shortcut rather than the only way. No new route — the drawer
is already a full-height sheet on a phone and `/admin/materials/new` renders the
same component.

**C — connect pipeline stages 4 to 7.** See *Stage 5 of the pipeline was never
wired in* under Phase 5, and the note below on what else is written and unused.

**D — the sync button**, Phase 6. Blocked on the Google service account; it will
ship gated behind `hasDrive` exactly as `hasJobs` gates uploads.

**Written and unused, measured 2026-09-17:** `hasDrive`, `hasCloudOcr` and
`hasSuggestions` in `src/lib/env.ts` have no readers anywhere, and the `sync_runs`
table has no writer. C and D are what give all four a caller.

### Requested before launch (2026-09-16)

Asked for directly, in the owner's words, and not yet built:

- [x] **A dedicated "Create category" button** — done. It sits beside the
      search box on `/admin/categories` and opens a small form taking a name
      *and a blurb*, which the search-or-create button cannot. The inline
      button is kept: it is the right flow when you are already hunting for a
      topic, and the wrong one when the job you came to do is "add a topic".
- [x] **Category management gated to Owner** — done, all four operations.
      `createCategory` and `renameCategory` were `requireSession` (any Editor);
      `mergeCategory` and `deleteCategory` were Admin. All are now
      `requireRole("owner")`, and there was no Owner gate anywhere in the
      codebase before this.

      Rename mattered more than it looks: the slug follows the name, so an
      Editor could change a public URL and break every link already shared.
      Merge is the one that moved 42 materials out of Faith by accident.

      **Filing is untouched** — Editors and Admins still file into topics that
      exist. What changed is that `assignCategory` no longer *creates* one as a
      side-effect: it checks the role and returns a message rather than calling
      `requireRole`, which redirects, because being thrown to the admin home
      mid-file with no explanation is a worse answer than being told why. The
      picker hides the create option to match, and its empty state now
      distinguishes "already filed there" from "no such topic, and only an
      Owner can add one" — it previously claimed the former for both.
- [x] **Author, treated as a first-class field** — done. The edit screen always
      had the input; the real gap was underneath it. **`ingestPdf` had no
      `author` parameter at all**, so nothing between a form and the materials
      row could carry one — an author added at upload time was not merely
      unasked, it was unstorable. It now threads the add form → both upload
      services → the task payload → ingest.

      Empty is stored as `null`, never `""`. An empty string passes every "is
      it set?" check, renders as a blank byline, and would split the author
      list into "unattributed" and "attributed to nothing".

      Browsing is a row of author chips on the library, built from
      `authorList()` — deliberately only the credited few, since most of the
      archive is unattributed and a directory of mostly-nothing is noise.
      Clicking the active author clears it, so the row is its own escape. The
      filter is an **exact** match, unlike `q`: it comes from a chip, so
      "Rev. Darrel Lee" must not also collect "Darrel Lee Jr". `author` is
      preserved across every topic, sort and pagination link — dropping it on a
      topic click is the obvious bug here and it is tested by hand.

      The author on a card is deliberately **not** a link: the whole card is
      already an anchor, and an anchor inside an anchor is invalid HTML.
- [x] **Search in the navbar, on every page** — done. A plain GET form to
      `/library`, the same contract the library's own box already uses, so it
      needs no JavaScript, no new route, and every result has a shareable URL.
      On a phone it sits inside the menu rather than being dropped, and the
      Explore Library button moves to `lg:` so the two do not collide.

      Search now also matches **topic names**, which the box has claimed since
      it was written ("Search materials or topics") without it being true.

      **Measured, and honest about it: that clause currently changes nothing.**
      Across six topic words it matched 15, 13, 10, 10, 5 and 10 materials —
      and in every case *every one of them was already matched* by the page
      text. Materials found by topic name alone: **0, for all six.** It is kept
      because a newly published upload has no OCR text until someone runs
      `ocr:local`, and for that material the topic name is the only thing to
      match on — but it earns its place on that argument, not on a measurement.

### Phase 7 — Launch

**Blocking — `main` cannot point at v2 until these are done:**

- [ ] **Trigger.dev tasks deployed.** The `dev` worker runs tasks on one machine
      only. Without a deploy, a material added in production uploads to R2,
      queues a run, and is never processed — and the form will look as though it
      worked.

      **Now automated**: `.github/workflows/deploy-trigger.yml` runs on every
      push to `main`. It needs one repository secret, `TRIGGER_ACCESS_TOKEN` —
      a personal access token from the Trigger.dev dashboard, *not*
      `TRIGGER_SECRET_KEY`, which can trigger runs but cannot deploy.

      Deliberately no `paths:` filter. A task bundles far more than
      `src/trigger/` — `ingest.ts`, `lib/pdf`, `lib/text`, the R2 client — and a
      filter that misses one transitive file fails silently, leaving an old
      worker with no error anywhere. A redundant deploy costs a minute; a missed
      one costs a stale worker nobody notices.

      The first deploy still has to be run by hand, because the token has to
      exist before a workflow can use it.
- [ ] Every environment variable set on Vercel, including `TRIGGER_SECRET_KEY`,
      `TRIGGER_PROJECT_REF` and `NEXT_PUBLIC_SITE_URL`. The last one is guarded:
      a production build without it fails loudly rather than publishing
      localhost URLs for Google to crawl.
- [ ] R2 serving from `cdn-higherway.mavilletech.com`. Every page image and
      every download comes from it.
- [ ] **Exercise the admin area in a browser.** None of it has been clicked —
      not the add drawer, the topic picker, the pencil editor, the account menu,
      the reader, or the duplicate review. It typechecks and its queries are
      verified against the real database, which is not the same thing.
- [ ] **One of the three end-to-end flows is covered; two are not.**
      `tests/e2e/reading.spec.ts` covers the public journey — home → library,
      search keeping its state in the URL, a material opening with its page
      images, a proper 404, robots and sitemap, and `/admin/materials` bouncing
      to sign-in — **14 passing** across desktop Chromium and mobile WebKit.
      They assert on structure and behaviour, never on a particular material
      being present, so filing and duplicate resolution cannot break them.
      Still unwritten, because both need a seeded session: invite → set
      password → sign in, and upload → duplicate flagged → review.

      `pnpm test:e2e` needs `pnpm exec playwright install` once per machine —
      and `install chromium` alone leaves the mobile project failing on a
      missing WebKit, which reads like a test failure and is not one.

**Functional gap worth deciding on before launch:**

- [ ] **A new upload gets no OCR.** `ingestPdf` takes a PDF's embedded text and
      nothing more, so a photographed document arrives with *no* searchable text
      until someone runs `pnpm ocr:local` on a Mac. Server-side OCR — tesseract
      on the worker, or Google Cloud Vision — is designed (§7) and unbuilt. For
      an archive whose purpose is being findable, this is the largest hole.
- [ ] **Nothing tells the admin when processing finishes.** The drawer says "it
      is being read now" and closes; the material appears on the next refresh.
      No polling, no realtime.
- [ ] Hybrid search. The library still filters by title and topic only.

**Then:**

- [ ] Analytics: Vercel, PostHog, Search Console
- [ ] Performance budget, accessibility pass
- [ ] Verified sending domain for invitations
- [ ] 83 duplicate pairs reviewed, 367 materials filed
- [ ] Cut `main` over from v1

`pnpm build` passes: 80 static pages, every route resolving, proxy middleware
building.

### After launch
- [ ] **Public submissions `/submit`** with Turnstile (the schema already
      supports it). Two design constraints, recorded from the owner because they
      decide whether the page works at all rather than being polish:

      **Short enough that interest survives it.** Anyone who arrives wanting to
      contribute is doing us a favour, and every field is a chance for them to
      decide it is not worth the time. Ask for the file and almost nothing else
      — a title we can correct later beats a form nobody finishes. Everything we
      would like to know (topic, author, year) either gets inferred, gets filled
      in by an editor during review, or goes unasked. The review queue already
      exists to catch what is missing, so the form does not have to.

      **Batch, the way Google Drive does it.** Select forty or fifty files at
      once, one action, done — not one file, one form, repeated fifty times. The
      pieces are already in place: uploads are presigned and go browser → R2
      directly, so a batch is N parallel PUTs with no server in the path and no
      4.5 MB body limit to worry about. What is missing is a queue in the UI
      with per-file progress, retry for the one that fails, and one
      `ingest` job per file rather than per submission.

      Worth thinking through before building: a batch of fifty photographed
      PDFs is fifty materials with no OCR (server-side OCR is still unbuilt),
      and duplicate detection is exactly what stops a well-meaning batch
      re-adding things the archive already holds.
- [ ] Optional AI suggestions, if the free ones fall short
- [ ] Text-to-audio, as raised in early planning

---

## Open questions

- **Search matches far too much, and ranks none of it.** Measured against the
  live archive: "prayer" returns **371 of 624 materials**, "heaven" 352,
  "salvation" 287. Any occurrence anywhere in a document's full text counts, and
  every hit is weighted the same, so a material *about* prayer sorts no higher
  than one that mentions it once on page 3. Sorting is by date or title only —
  there is no relevance order at all.

  This is not new and nothing above caused it; it simply was not measured until
  now. It is the strongest practical argument for the hybrid search in Phase 5:
  Postgres full-text gives `ts_rank` almost for free, and the embeddings would
  put "trusting God through illness" above a passing mention. Worth deciding
  before launch whether a 59%-of-the-archive result set is acceptable in the
  meantime.
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
