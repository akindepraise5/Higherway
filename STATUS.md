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
- [ ] Resend API key
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

**Not yet done, and waiting on the backfill to finish:** a second `pnpm fix:names`
run. The backfill process was started before `putObject` learned to set the
download name, so everything it uploads from that point lands without the header.
The script is idempotent, so re-running it costs nothing.

### Phase 3 — Auth and admin shell
- [ ] Better Auth, sign-up disabled, seeded Owner
- [ ] Invites: token, email, Copy invite link, accept page
- [ ] Roles: Owner ⊃ Admin ⊃ Editor
- [ ] Audit log written inside every mutation
- [ ] Admin layout, dashboard, Activity page

### Phase 4 — Managing materials
- [ ] Materials table: filter, sort, bulk actions
- [ ] Material editor, per-material history, text-public switch
- [ ] Upload (presigned) and import by URL, with the safety checks in §6
- [ ] Categories: CRUD, merge, search-or-create picker

### Phase 5 — Reading and duplicates
- [ ] OCR interface; tesseract.js on the worker
- [ ] `scripts/ocr-local.ts` — macOS Vision, plus the re-read queue
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
