# Higherway — Architecture

> **This file is the source of truth for how Higherway is built.**
> If code and this document disagree, one of them is a bug. Update this file in the
> same change that alters the structure it describes.
>
> Last updated: 2026-09-17

---

## 1. What this is

Higherway is a free, public archive of a church publication: 651 PDFs (and growing),
each opened, read and downloaded by anyone, with no account required.

Two audiences:

| Audience | Gets |
|---|---|
| **The public** | A fast, quiet site: browse, search by meaning as well as by title, read in the browser, download. No login, no tracking wall. |
| **Admins** | A panel to add materials, categorise them, catch duplicates, pull new files from Google Drive, invite colleagues, and see who did what. |

**v1 (the current site)** is a single `index.html` reading a public Google Sheet in the
browser and linking out to Google Drive. It is kept at `docs/legacy/index.html` for
reference. **v2 (this codebase)** replaces it.

---

## 2. The one rule that shapes everything

**Postgres holds the records. R2 holds the files. Google Drive is a read-only inbox.**

```
                   ┌──────────────── ONE ingestion pipeline ──────────────┐
  Admin upload  ──►│                                                      │
  Paste a URL   ──►│  stage → fingerprint → pages → text → embed →        │──► published
  Drive sync    ──►│  duplicate scan → suggestions → human review         │
  Public submit ──►│                                                      │
  (later)          └──────────────────────────────────────────────────────┘

  Neon Postgres ── records, categories, OCR text, embeddings, audit log
  Cloudflare R2 ── original PDFs + rendered page images (serves the site)
  Google Drive  ── read-only source of files that never came through the app
```

Consequences, and they are not negotiable without revisiting this section:

- **Nothing is ever written back to Google Drive.** No mirroring, no deleting, no renaming.
- **Sync is manual and one-way** (Drive → R2). An admin presses a button.
- A file deleted in Drive after import does **not** affect the app.
- A file *changed* in Drive after import is **flagged for review**, never pulled silently.
- Every imported file records its Drive ID and checksum, so re-syncing never imports twice.

---

## 3. Stack

Versions are what was current on 2026-09-16; keep them pinned in `package.json`.

| Area | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript strict | Server Components keep the public pages nearly JavaScript-free |
| Package manager | pnpm 11 (Node 24) | Fast, strict about phantom dependencies |
| Styling | Tailwind CSS 4, shadcn/ui | Tokens in CSS, components we own and can restyle |
| Animation | `motion` 13 (imported from `motion/react`) | The current name of Framer Motion |
| Database | Neon Postgres + Drizzle ORM, with `pgvector` and `pg_trgm` | Serverless Postgres, typed queries, vector + fuzzy search in one place |
| Files | Cloudflare R2 via the S3 API | 10 GB free, **no charge for data transfer out** |
| Auth | Better Auth | Email + password, sessions, roles; public sign-up disabled |
| Email | Resend. **Plain HTML, not React Email** — see §13 | Invites and password resets |
| Jobs | Trigger.dev | Runs off Vercel, so no function timeouts on PDF work |
| PDF | `mupdf` (render pages + extract text), `sharp` (WebP) | Both free and local |
| OCR | embedded text → macOS Vision (local) → Google Cloud Vision (server) → tesseract.js. All four are built | See §7 |
| Suggestions | **The local embeddings** — topics, with no credentials at all (§8). Cloudflare Workers AI remains the plan for titles and summaries, unbuilt | Measured at 56% on the top three topics against 253 hand-filed materials. Workers AI gives 10,000 neurons/day free and contractually does not train on our content |
| Embeddings | `@huggingface/transformers` running `bge-small-en-v1.5` (384 dimensions) | Free forever, no external quota, small enough for Neon's free tier |
| Analytics | Vercel Analytics + Speed Insights, PostHog | Free tiers cover us many times over |
| Abuse | Cloudflare Turnstile | Free, for public submissions later |
| Tests | Vitest (logic), Playwright (flows) | |

### Free-tier position (verified 2026-09-16)

Everything above runs free at our size. Three things to keep in view:

1. **Neon's free plan allows 0.5 GB.** Our index (text + 384-dimension embeddings)
   lands near 25–30 MB. Do not switch to larger embeddings without re-checking this.
2. **R2 gives 10 GB free, then $0.015 per GB-month.** There is no cliff and no egress
   charge: an archive that grew to 20 GB would cost about **$0.15/month**. Storage is
   not a reason to compromise on keeping original files intact.
3. **Cloudflare's free `r2.dev` address is rate-limited and not meant for production.**
   A custom domain on the bucket is free and is the launch requirement.
4. **Vercel's Hobby plan is for non-commercial use**, and their test is whether anyone
   is *paid* to build or maintain the site, not whether the organisation is a nonprofit.
   Donations are explicitly allowed. If paid work is involved, Pro is $20/month.

### Domains

`mavilletech.com` is on Cloudflare and verified in Resend today; the project's own
domain comes later. The split, chosen so the later move costs nothing:

| Purpose | Now | Later |
|---|---|---|
| Serving PDFs and page images | `cdn-higherway.mavilletech.com` → R2 bucket `higherway` | move the CNAME |
| Sending invites and resets | a `mavilletech.com` sender | change `EMAIL_FROM` |
| The public site | the Vercel URL | the purchased domain |

The public site deliberately stays on the Vercel URL until the real domain is bought.
Files and email are invisible to search engines, but letting Google index the site on a
temporary domain buys redirect cleanup for no benefit.

**No URL is ever hardcoded.** Every address above is an environment variable (§12), so
changing domain is a DNS change plus a handful of variables, never a code change.

### Moving the bucket or the domain later

The database stores R2 **keys** (`materials/<id>/original.pdf`), never absolute URLs.
Addresses are built at render time from `R2_PUBLIC_BASE_URL`. So:

| Change | What it takes | Data migration |
|---|---|---|
| New public domain | Point the CNAME at the bucket, change `R2_PUBLIC_BASE_URL` | **None** |
| New bucket | Copy the objects across, change `R2_BUCKET` | **None** — keys are identical |
| New site domain | Change `NEXT_PUBLIC_SITE_URL`, add redirects | None |

This is why keys are stored rather than URLs, and why the key scheme in
`lib/r2/keys.ts` is treated as fixed: the addresses can move freely, but a key that
changes orphans a file.

**The download name is a header, not a key.** A material saves as *The Way of
Holiness.pdf*, but its key stays `original.pdf` — the name travels in the object's
`Content-Disposition`, set when it is stored. A cross-origin download ignores HTML's
`download` attribute, so the header is the only thing browsers honour. Renaming a
material therefore needs `pnpm fix:names`, which rewrites the metadata in place
without moving the file or re-uploading its bytes.

---

## 4. Repository layout

```
higherway/
├── CLAUDE.md               how to work in this repo (read first)
├── ARCHITECTURE.md         this file — the source of truth
├── STATUS.md               what is done, in progress, and next
├── assets/                 the two font files the social images are set in
├── trigger.config.ts       background jobs; four packages are external (§6)
├── drizzle.config.ts  next.config.ts  biome.json  playwright.config.ts
├── docs/
│   └── legacy/index.html   the v1 site, kept for reference
├── scripts/                one-off and local-only jobs (run on a Mac)
│   ├── import-sheet.ts     seed records + categories from the Google Sheet
│   ├── backfill.ts         download every Drive file → R2 → process
│   ├── ocr-local.ts        re-read the queue with macOS Vision
│   ├── vision-ocr.swift    the Vision call itself (VNRecognizeTextRequest)
│   ├── scan-duplicates.ts  score every pair, write duplicate_pairs (§8)
│   ├── embed.ts            chunk + embed the archive, and the topics (§9)
│   ├── resolve-stuck.ts    settle what the backfill left staged
│   ├── fix-download-names.ts   re-set Content-Disposition on stored objects
│   ├── undo-merge.ts       rebuild a category merged by mistake
│   └── reinvite-owner.ts   re-issue the first owner invitation
├── src/
│   ├── proxy.ts            route guards — Next 16's name for middleware
│   ├── app/
│   │   ├── (public)/       home, library, topics/[slug], m/[slug], about
│   │   ├── admin/          overview, materials (+ [id], new), categories,
│   │   │                   duplicates, sync, users, activity, profile
│   │   ├── sign-in/        not in a route group: proxy.ts matches /sign-in
│   │   ├── invite/[token]/ accepting an invitation, then setting a password
│   │   ├── api/auth/[...all]/   the Better Auth handler
│   │   └── layout.tsx  sitemap.ts  robots.ts  icon.svg  apple-icon.tsx
│   │       opengraph-image.tsx
│   ├── components/
│   │   ├── ui/             shadcn primitives
│   │   ├── public/         site components, including the cover artwork (§9)
│   │   ├── admin/          panel components
│   │   └── auth/           the sign-in shell and form
│   ├── db/
│   │   ├── index.ts        Neon HTTP — reads only
│   │   ├── tx.ts           pooled WebSocket — every mutation (§11, §13)
│   │   ├── schema/         Drizzle tables, one file per area
│   │   ├── migrations/
│   │   └── seed.ts         categories + the first owner account
│   ├── lib/                pure, testable modules — no database access
│   │   ├── art/            cover generation (seeded, deterministic)
│   │   ├── dedupe/         fingerprints, title normalising, scoring
│   │   ├── import/         the guard on an imported link (§6)
│   │   ├── ocr/            the engine interface, and the junk filter (§7)
│   │   ├── pdf/            render pages, extract embedded text
│   │   ├── r2/             storage keys and download names
│   │   ├── sheet/          the v1 CSV parser
│   │   ├── text/           clean, chunk, shingle, quality score
│   │   └── upload/         batch limits, and a title from a filename
│   ├── server/             the database, the network, the environment
│   │   ├── ingest.ts       one pipeline, whatever the source (§6)
│   │   ├── audit.ts        writes the trail — activity.ts only reads it
│   │   ├── services/       every mutation, each audited in its own transaction
│   │   ├── r2/             the storage client
│   │   ├── drive/          the read-only Drive client (§2) — GETs only
│   │   ├── embed/          local embeddings, and storing them (§9)
│   │   ├── ocr/            Google Cloud Vision and tesseract.js (§7)
│   │   ├── og/             the logo and fonts for the social images
│   │   ├── suggest/        topics for an unfiled material (§8)
│   │   └── materials/ categories/ duplicates/ users/ auth/ sync/  read queries
│   └── trigger/            Trigger.dev tasks, chained: process-material →
│                           read-material → enrich-material; plus sync-drive
└── tests/
    ├── unit/               vitest — though most unit tests sit beside
    │                       the module they cover, as `*.test.ts`
    └── e2e/                playwright
```

**`lib/` is pure.** No database, no network, no environment variables. That is what makes
duplicate detection, cover art and text handling testable without a database.
**`server/services/` is the only place that mutates data**, because that is where the
audit log is written in the same transaction (§11).

---

## 5. Data model

Drizzle tables in `src/db/schema/`. Names are indicative; the migrations are authoritative.

### `materials`
The central record. One row per material, regardless of where it came from.

| Column | Notes |
|---|---|
| `id`, `slug` | Slug is stable once published; it is the public URL |
| `title`, `title_original` | We keep whatever the source called it, and the cleaned title we show |
| `summary`, `author` | Optional; may be suggested (§8) |
| `status` | `staged` → `processing` → `review` → `published`, plus `archived`, `rejected` |
| `source` | `drive_sync`, `admin_upload`, `url_import`, `public_submission` |
| `r2_key_pdf`, `byte_size`, `page_count`, `sha256` | `sha256` is unique among live rows |
| `drive_file_id`, `drive_md5`, `drive_checked_at` | Unique when present; how re-import is avoided |
| `ocr_engine`, `ocr_quality`, `text_status` | Which engine read it and how well (§7) |
| `text_public` | Whether the OCR text is shown publicly (default true, per-material switch) |
| `published_at`, `archived_at`, `duplicate_of_id` | Archiving is soft; nothing is destroyed |
| `view_count`, `download_count` | Our own counters, used for "Most read" |

### `material_pages`
One row per page: `page_number`, `r2_key_webp`, `width`, `height`, `text`, `ocr_engine`.
Drives the reader, page-level search results, and re-OCR.

### `categories` and `material_categories`
Categories are many-to-many. `categories` holds `name`, `slug`, `blurb`, `sort_order`,
`embedding`. A material with no category is shown as **Uncategorised**; that is a
computed state, not a row, so nothing has to be re-filed when a category is finally given.

Seeded from the 69 topics found in the v1 spreadsheet. Merging two categories is a
first-class action — the archive already has 19 topics used exactly once.

### `material_chunks`
`material_id`, `page_number`, `text`, `embedding vector(384)`, `tsv tsvector`.
Chunk-level rows are what make meaning-based search able to point at a page.

### `duplicate_pairs`
`material_a_id`, `material_b_id` (ordered), `score`, `signals jsonb`, `status`
(`pending`, `dismissed`, `merged`), `decided_by`, `decided_at`.
A dismissed pair is never raised again.

### `users`, `sessions`, `accounts`, `invitations`
Better Auth owns the first three. `invitations` holds `email`, `role`, `token_hash`,
`expires_at`, `accepted_at`, `invited_by`. Tokens are single-use, expire in 72 hours,
and only their hash is stored.

### `audit_log`
`actor_id`, `action`, `entity_type`, `entity_id`, `before jsonb`, `after jsonb`,
`ip`, `user_agent`, `created_at`. Append-only. §11.

### `sync_runs`
One row per press of the Sync button: who, when, counts of imported / skipped /
flagged / failed, and the error detail. This is the sync history page.

---

## 6. The ingestion pipeline

Every material, whatever its source, walks the same path. Implemented as a
Trigger.dev task per stage so a failure can be retried without redoing the rest.

| Stage | What happens | Free? |
|---|---|---|
| **1. Stage** | File lands in `r2://staging/`. Browser uploads go straight to R2 with a presigned URL, because Vercel refuses request bodies over 4.5 MB. Staged files expire after 30 days. | Yes |
| **2. Fingerprint** | SHA-256 of the bytes. An exact match against a live material **stops here** and reports the existing one. | Yes |
| **3. Pages** | `mupdf` renders each page; `sharp` writes WebP at reading width plus a thumbnail. | Yes |
| **4. Text** | Embedded text layer if the PDF has one; otherwise OCR (§7). Each page gets a quality score. | Yes |
| **5. Embed** | Chunk the text, embed locally with `bge-small-en-v1.5`, store chunk vectors plus one document vector. | Yes |
| **6. Duplicate scan** | Score against existing materials (§8). Anything above the threshold creates a `duplicate_pairs` row. | Yes |
| **7. Suggest** | Cleaned title, summary, categories (§8). | Yes by default |
| **8. Review** | Drive-sourced files publish automatically **unless** flagged as a possible duplicate. Everything else waits for a human. | — |
| **9. Publish** | Move out of staging, assign the slug, index for search, make it public. | Yes |

**Importing by URL** (stage 1 variant): paste one link or a list. The server fetches
each one, and must: refuse anything that is not a PDF (checked by reading the file's
own header, not its name), cap the size, time out, and **refuse private network
addresses** — a pasted link must not be usable to reach internal services.

---

## 7. Reading the documents (OCR)

Measured on real files from this archive on 2026-09-16. The archive is a mix of
born-digital PDFs, CamScanner phone scans and raw phone photos of printed pages.

| Engine | Speed | Accuracy | Two columns | Embedded photos | Runs on |
|---|---|---|---|---|---|
| Embedded text layer | instant | perfect | n/a | n/a | anywhere |
| **macOS Vision** (`VNRecognizeTextRequest`, accurate) | 0.73 s/page | ~97–99% | correct order | ignored correctly | macOS only |
| **tesseract.js** | 2.73 s/page | ~90–95% | interleaves columns | invents text from them | anywhere |

**The strategy, cheapest first:**

1. **Take the embedded text** when the PDF has one. Free, instant, perfect.
2. **macOS Vision for the backlog**, run locally via `scripts/ocr-local.ts`.
   **13 minutes** for the whole archive (~1,100 pages).
3. **Google Cloud Vision for new uploads on the server.** At 1.68 pages per document and
   a few uploads a week, ongoing OCR is about **35 pages a month** against a free
   allowance of **1,000 pages a month** — free permanently, with a real document OCR
   engine rather than a general-purpose model. The catch: Google requires a billing
   account on file even at zero spend.
4. **tesseract.js as the fallback** when no Google credentials are configured, so the
   project always works out of the box. ~90–95%, scrambles two-column reading order,
   invents text from photographs — strip obvious junk tokens (no vowels, lone symbols)
   before indexing.
5. **The re-read queue.** Anything not read by Vision is listed in the admin panel, and
   `pnpm ocr:local` upgrades those pages. `ocr_engine` and `ocr_quality` on each page
   say what has been done and how well.

**Free vision-language models were considered and rejected for now** (Cloudflare Llama
Vision, Moondream, Gemini Flash, Qwen-VL via OpenRouter). They are general-purpose
models, not OCR engines, and no benchmark exists for any of them on photographed
two-column pages with embedded photographs. Vision already scores 97–99% for free. If
one is ever adopted, it must first beat tesseract.js on 20–30 of the *hardest* pages in
this archive, not on a neat sample.

### Scale (measured 2026-09-16, not estimated)

648 of 651 files probed for size; 25 sampled for page count.

| | |
|---|---|
| Archive | **2.04 GB**, mean 3.2 MB, median 2.11 MB, max 24 MB |
| Size spread | 305 under 2 MB, 239 at 2–5 MB, 48 at 5–10 MB, 56 over 10 MB |
| Pages per document | mean **1.68**, median 2, max 4 (24 of 25 were 1–3 pages) |
| **Total pages** | **~1,100** (range 890–1,300) |
| Page render | WebP at 1400px: ~200–280 KB/page at quality 72, **~490 KB at quality 80**. These are photographic scans (~275 ppi JPEGs), so they do not compress like text. |
| Page images total | 0.2–0.7 GB depending on quality chosen |
| **R2 total** | **2.24–2.74 GB** — roughly a quarter of the 10 GB free tier |
| Page rendering | ~0.4–0.6s per page, measured through our own pipeline — so ~10 minutes to render the whole archive |
| Full-archive OCR | **13 minutes** with Vision, ~50 with tesseract.js |

A large file means a high-resolution photograph, not a long document: one 13.6 MB file
holds 2 pages. Budget by page count, never by megabytes.

This scale matters for choices elsewhere. At ~1,100 pages, paid OCR is nearly free too —
Google Cloud Vision's 1,000-pages-a-month free allowance covers the backlog for about
**$0.15**, or nothing if run across two months. It stays a fallback rather than the plan,
because Vision on a Mac is better and costs nothing, but the door is cheap to open.

Known failure mode for both engines: heavy skew, curved book spines, dark photographs.
Neither straightens pages. The quality score is how those surface instead of quietly
poisoning search.

**If hands-off top quality is ever wanted**, Google Cloud Vision costs about $10 once
for this backlog and stays inside its free monthly allowance afterwards. The OCR engine
is an interface in `lib/ocr/`; adding it is a new implementation, not a rewrite.

---

## 8. Duplicates, and the suggestions that come with them

The archive arrives with duplicates: **62 exact-title groups covering 132 rows**, and
69 groups once case and punctuation are ignored. One title appears three times.

### Signals

| Signal | Catches | Method | Verdict |
|---|---|---|---|
| Identical bytes | the same file twice | SHA-256, computed in the browser before upload | **Blocks** |
| Similar title | "A Heart Like His" vs "A heart like His (1)" | normalise (strip `2017-01-FTWord-`, `(1)`, `copy of`, case, punctuation) then compare significant words. A differing trailing series number scores 0 | Flags at ≥ 0.55 |
| Same text | a re-scan of the same article | overlap of 3-word shingles, tolerant of OCR noise | Flags at ≥ 0.7 |
| Similar meaning | a retyped or re-set copy | cosine distance between document vectors | Flags at ≥ 0.93 |
| Contained | an article reprinted inside a booklet | how much of the shorter text appears in the longer | Flags at ≥ 0.9, **separately** |

**These numbers were measured, not chosen.** Two OCR reads of one page from this
archive ("to" read as "lo", "built" as "buiIt"), against an unrelated material as a
control:

| Shingle size | Same page twice | Unrelated | Article inside a booklet |
|---|---|---|---|
| **3** | **0.778** | 0.000 | 0.500 |
| 4 | 0.722 | 0.000 | 0.477 |
| 5 | 0.667 | 0.000 | 0.455 |

Three-word shingles score the true pair highest while an unrelated pair stays at
zero, so nothing is given up for the sensitivity. A threshold of 0.8 was tried first
and **would have missed the true pair**: each misread word costs a fixed number of
shingles however short the passage, so short texts are penalised hardest.

Containment is kept as its own signal rather than blended into "same text". A reprint
contains every shingle of the original by definition, so mixing the two rated that
pair at 0.79 against a genuine duplicate's 0.78 — no separation at all. Held apart,
the review page can say *"this appears inside that"* instead of *"these are the
same"*, which is a different thing for an admin to decide about.

**A series is not a duplicate of itself.** The first scan of the real archive raised
"Questions and answers Vol 1" against "Vol 2" at 0.510 — three shared words out of
four, clearing the title threshold with no content evidence behind it at all. That
trailing number is the entire difference between the two materials, not incidental
noise, so two titles alike in everything but a trailing number now score 0 on the
title signal.

The rule is narrow, and deliberately so. It fires only when the rest of the title
matches exactly, leaving "The Place of Full Surrender" against "A Place of Surrender"
untouched, and it suppresses the title alone: "Our Conscience is a Witness" against
"…Witness1" keeps its containment finding — five pages inside forty-eight — and is
still raised. Re-scored against the live pairs rather than argued in the abstract:
82 of 87 unchanged, 4 dropped, every one a series.

A shared series *prefix* is left alone — "Exploring the word Holiness" against
"Exploring the word". Telling a series from a retitled reprint there is a judgement
for a person, not a rule worth inventing.

Signals combine into a score with the reasons kept in `signals`, so the review page can
say *why* rather than showing a number.

### Review

Pairs are grouped into clusters (three copies are one group, not three pairs). Each shows
its first page, page count, size, date added and categories, side by side. The admin
either **keeps one** — the others are archived, marked `duplicate_of_id`, and their
categories and counters merge into the keeper — or says **not duplicates**, which is
remembered permanently.

**Nothing is ever deleted automatically.** Archiving is reversible; only an Owner can
destroy anything, and every step is audited.

### Suggestions (free by default)

- **Categories:** compare the document vector against category vectors, propose the top
  three. No service, no cost.
- **Title:** rule-based cleanup of filename-style titles.
- **Summary:** the opening lines of the text.

All three arrive as *suggestions* with accept / reject / change, never applied silently.

A language model does this noticeably better, and it is **free**. Verified 2026-09-16:

| Option | Free allowance | Trains on our content? |
|---|---|---|
| **Cloudflare Workers AI** (default) | 10,000 neurons/day — the whole 651-document run fits in about one day, and ~5/week thereafter is negligible | **No.** *"Cloudflare does not use your Customer Content to train any AI models... or improve any Cloudflare or third-party services."* |
| Local Ollama on a Mac (fallback) | unlimited | No — nothing leaves the machine. ~2–4.5 hours for the backlog |
| Gemini free tier (**rejected**) | generous | **Yes.** *"Google uses the content you submit... to provide, improve, and develop Google products and services"*, with human review |
| Mistral free tier (**rejected**) | generous | Yes by default; opt-out required |

`lib/ai/` is a provider interface, so the engine is swappable and the **embedding-similarity
suggestions remain the zero-dependency baseline** — the project works with no AI
credentials at all. Pilot any model on 20–30 documents before a full run: the open
question is whether a small model reliably picks from a 69-item category list.

---

## 9. The public site

### Routes

| Route | Notes |
|---|---|
| `/` | Hero, latest, recently added, topics |
| `/library` | Search, category filters, sort, paging — state in the URL |
| `/topics/[slug]` | A real landing page per topic, for search engines |
| `/m/[slug]` | A material. In-app navigation opens it as a **drawer** over the library via an intercepting route; a direct visit renders the full page. |
| `/about`, `/submit` | `/submit` ships after launch |

Old `#/...` links from v1 redirect to their new addresses.

### The reader

Page images (WebP, roughly 150–250 KB) loaded as you scroll, with zoom, keyboard
navigation, jump-to-page, share, and **Download PDF** straight from R2. No PDF library
ships to the browser.

### Search

Three methods fused by reciprocal rank:

1. Postgres full-text over title, summary and text, weighted;
2. `pg_trgm` on titles, so typos still land;
3. `pgvector` over chunks, which is what makes "trusting God during sickness" work.

Vector hits carry a page number, so a result can open the reader at the right page.

### Covers

The v1 generated artwork is kept and improved: rendered on the server as SVG with no
client JavaScript, seeded by the material's own identity so a cover never changes, titles
that size themselves to fit, and the same art reused for social sharing images via
`next/og`. Code lives in `lib/art/` and stays pure and deterministic — it is unit tested.

### SEO

The reason this matters: photographed pages are invisible to search engines. The OCR text
is what makes 651 materials findable. Each material page carries its text (collapsed, with
a per-material switch to hide it), structured data, a canonical URL, a generated social
image, and entries in a `sitemap.xml` built from the database.

### Weight budget

Public pages are Server Components by default. PostHog loads lazily. Admin code never
reaches a public visitor. A route that needs client JavaScript should justify it in review.

---

## 10. Accounts and roles

Sign-up is **disabled**. The first Owner is seeded; everyone else is invited.

**Invite flow:** admin enters an email and role → a single-use token (72 hours, stored
hashed) → Resend sends a link to `/invite/[token]`, or the admin copies the link → the
recipient sets a password and is logged in. Invitations can be resent or revoked.

**Roles are strictly nested. Owner ⊃ Admin ⊃ Editor.**

| | Editor | Admin | Owner |
|---|---|---|---|
| Upload, import by URL, edit metadata, categorise | ✅ | ✅ | ✅ |
| Create and merge categories | ✅ | ✅ | ✅ |
| Run Drive sync | ✅ | ✅ | ✅ |
| Resolve duplicates, archive materials | — | ✅ | ✅ |
| Approve public submissions | — | ✅ | ✅ |
| Invite and manage Editors | — | ✅ | ✅ |
| Manage Admins, site settings, permanent delete | — | — | ✅ |

---

## 11. Audit and analytics

**Every mutation** goes through `server/services/` and writes an `audit_log` row **in the
same transaction** as the change. A change that cannot be audited must not happen. The
Activity page filters by person, action and entity; each material has its own history tab.

This forced a second database connection. Neon's HTTP driver — fast and pool-free, and
what every page query uses — has **no transaction support whatsoever**: `db.transaction()`
throws rather than degrading quietly. Mutations therefore use a pooled WebSocket
connection (`src/db/tx.ts`), where a real interactive transaction works. Reads stay on
HTTP. Measured, not assumed: the probe that established this is recorded in §13.

Two separate things, do not confuse them:

- **Audit** — what staff did. Ours, in Postgres, permanent.
- **Analytics** — what visitors did. Vercel Analytics and Speed Insights for performance,
  PostHog for behaviour (search, open, read depth, download), plus our own view and
  download counters that feed the admin dashboard and the public "Most read" row.

---

## 12. Environment

`.env.example` carries every key with dummy values and a comment saying where to get it.
No real secret is ever committed.

```
DATABASE_URL                      Neon
BETTER_AUTH_SECRET / _URL         auth
NEXT_PUBLIC_SITE_URL              used by sitemap, canonicals, emails
R2_ACCOUNT_ID / _ACCESS_KEY_ID / _SECRET_ACCESS_KEY / _BUCKET
R2_PUBLIC_BASE_URL                custom domain on the bucket
GOOGLE_SERVICE_ACCOUNT_EMAIL / _PRIVATE_KEY
GOOGLE_DRIVE_FOLDER_ID            the inbox folder, read-only
RESEND_API_KEY / EMAIL_FROM
TRIGGER_SECRET_KEY
SEED_OWNER_EMAIL / _NAME
NEXT_PUBLIC_POSTHOG_KEY / _HOST
TURNSTILE_SITE_KEY / _SECRET_KEY  public submissions, later
CLOUDFLARE_ACCOUNT_ID             Workers AI — title, summary and category suggestions
CLOUDFLARE_AI_TOKEN               Workers AI token, free tier
GOOGLE_CLOUD_VISION_KEY           optional — server-side OCR, 1,000 pages/month free.
                                  Unset falls back to tesseract.js; nothing breaks.
```

---

## 13. Decisions on record

| Date | Decision | Why |
|---|---|---|
| 2026-09-16 | R2 is the source of truth for files; Drive is a read-only inbox | Two writable stores create conflicts nobody can reason about |
| 2026-09-16 | Sync is manual, one-way, and never writes to Drive | The owner asked for it, and it removes a whole class of bugs |
| 2026-09-16 | A Drive file changed after import is flagged, never pulled silently | Nothing the public sees should change without a human |
| 2026-09-16 | Records live in Postgres; the spreadsheet is imported once, then retired | One place to edit a record |
| 2026-09-16 | OCR: embedded text → macOS Vision locally → tesseract.js on the server | Measured: Vision is 3.7× faster and clearly better, but macOS-only |
| 2026-09-16 | Embeddings run locally at 384 dimensions | Free forever, and fits Neon's 0.5 GB free plan |
| ~~2026-09-16~~ | ~~AI suggestions run on Cloudflare Workers AI~~ — **superseded 2026-09-17** | Never built: `hasSuggestions` gated a client that has never existed. Topic suggestions now run on the local embeddings with no credentials at all, so there is nothing left for it to gate. Titles and summaries are still unbuilt, and Workers AI remains the plan for those |
| 2026-09-16 | Gemini and Mistral free tiers rejected for suggestions | Both train on free-tier content by default |
| 2026-09-16 | Free vision-language models rejected for OCR | Not OCR engines, and unbenchmarked on pages like ours; Vision is free and scores 97–99% |
| 2026-09-16 | Server-side OCR is Google Cloud Vision, tesseract.js when unset | ~35 pages/month against a 1,000-page free allowance |
| 2026-09-16 | Measured, not assumed: 2.04 GB, ~1,100 pages, 1.68 pages/document | The archive is a seventh of the assumed workload; everything fits free |
| 2026-09-16 | Reads use Neon HTTP; **mutations use a pooled WebSocket connection** (`src/db/tx.ts`) | Probed directly: `db.transaction()` on neon-http fails with "No transactions support in neon-http driver". Auditing a change in the same transaction as the change is a requirement, not a preference, so the service layer needs a driver that can actually do it |
| 2026-09-16 | The OCR text is public by default, collapsed, with a per-material switch | It is the only thing that makes the archive findable |
| 2026-09-16 | Public submissions designed into the schema now, built after launch | Keeps the first release focused |
| 2026-09-16 | The backfill publishes directly; no review queue for the v1 archive | These 651 were already published for years in print and on the v1 site. Holding them for approval would be re-deciding something the church already decided. New uploads still go through review |
| 2026-09-16 | Roles are strictly nested: Owner ⊃ Admin ⊃ Editor | Simple to explain, simple to check |
| 2026-09-16 | shadcn's semantic tokens are mapped onto the Higherway palette in `globals.css` | A generated component is on-brand immediately, with no per-component overrides. `--background` is paper, `--primary` is ink, `--ring` is gold, the sidebar is forest |
| 2026-09-16 | Geist removed from `layout.tsx`; the faces stay Newsreader + Instrument Sans | `shadcn init` adds Geist bound to `--font-sans`, which silently replaces the v1 typography. **Re-running init reintroduces this — check `layout.tsx` and the `@theme inline` block afterwards** |
| 2026-09-16 | PDF processing runs as a Trigger.dev task, not inside the request that uploads the file | Owner's decision, and it keeps §3 and §6 honest rather than quietly deviating from them. Processing in-request was defensible on the measurements — 1.68 pages per document at 0.4–0.6s a page — but it would have put rendering on a function timeout, and the largest files are 13 MB photographs. The cost is that adding a material does nothing until `TRIGGER_SECRET_KEY` exists, so the form says so instead of accepting a file it would leave in staging |
| 2026-09-16 | One ingestion path for every source (`src/server/ingest.ts`) | An uploaded material, an imported link and a backfilled file should be indistinguishable afterwards. The pipeline runs its slow work *outside* the transaction and takes two short transactions around it — `src/db/tx.ts` pools three connections, so a transaction spanning a 13 MB upload would block every other mutation behind a file transfer |
| 2026-09-16 | `mupdf` and `sharp` are in `build.external` for Trigger.dev | A WASM module and a native binary cannot be bundled. Left out, the task builds and then fails at runtime, which is the worst order to discover it |
| 2026-09-16 | Filing and unfiling are separate audit actions (`material.categorise` / `material.uncategorise`) | One action for two opposite events meant no reader could tell "added to Faith" from "removed from Faith", and the trail could not answer who removed something. An undo must never wear the name of the thing it undid — the same reason `category.unmerge` exists |
| 2026-09-16 | The 27 materials the backfill left stuck are archived as duplicates, not retried | Hashing the bytes proved 24 of them byte-identical to a material already live: the v1 sheet lists the same Drive file twice, and `materials_sha256_live_idx` refused the copy. The index was working; only its failure was being treated as a crash. Byte-identical matches under a *different* title are held back for a person, because naming them is a judgement |
| 2026-09-16 | Every R2 request carries explicit timeouts, with `throwOnRequestTimeout` set | The SDK defaults every timeout to 0, which it documents as "disables the timeout". A re-read of 1,162 pages sat at 0% CPU for 53 minutes — no open sockets, no error, no output — having silently stopped after ~491 pages: an `await` that could never settle, because the response had gone and nothing was counting. Setting the numbers alone is not enough; without `throwOnRequestTimeout` a breach is only logged as a warning, since `requestTimeout` was for years applied as a socket idle timeout. `ingestPdf` uses the same client, so this was one dropped packet away from stranding a background job instead |
| 2026-09-16 | A differing trailing series number sets the title signal to 0 | "Questions and answers Vol 1" against "Vol 2" scored 0.510 on three shared words of four, with no content evidence. The number is the difference between the materials, not noise. Narrow by design: only when the rest of the title matches exactly, and content signals are untouched, so a contained reprint is still raised |
| 2026-09-18 | The invitation email is hand-written HTML, not React Email | There is one email. `@react-email/components` is a substantial dependency for sixty lines of table markup, and the template is a pure function with tests either way. Revisit at the second and third email, which is when a library starts paying for itself |
| 2026-09-18 | Sending an email can never fail the mutation that triggered it | The invitation is the real thing: the row exists, the token is valid, the link works. Sending inside the transaction would let a blip at a third party destroy a good invitation; sending before it would email a link to a row that might not be written. It sends after the commit, cannot throw, and reports whether it went |
| 2026-09-17 | **The material row is created when the file is staged, not inside the task** | Stage 1 in §6 has always said `staged` means "in `r2://staging/`, nothing else done yet", and the code created the row in `process-material` instead. So a material did not exist until a worker picked the run up: two uploads to a project with no running worker left the form saying "Uploaded" and the archive showing nothing at all — no row, no error, nothing outside the bucket, and no screen that *could* have shown it. The task adopts the staged row now, a duplicate or an unreadable file marks it `rejected` with the reason in the trail, and an "In progress" filter shows the states that previously had no way to be seen |
| 2026-09-17 | Each pipeline stage is its own Trigger task, chained: `process-material` → `read-material` → `enrich-material` | §6 always said one task per stage; it was one task doing three. Separated, a plain upload never waits on a recogniser or a 33 MB model download, and a failed embed never costs a second render of a 13 MB photograph. The chain order is a real dependency, not a preference: embedding text nobody has read yet stores a vector of nothing, and the duplicate scan would then compare two such vectors and call them identical |
| 2026-09-17 | Topic suggestions are a **nearest-neighbour vote merged with the topic-name comparison**, not the name comparison alone | Measured against 253 hand-filed materials: names alone 45%, neighbours alone 38% (but 58% on the third of materials they answer for), merged **56%**. `categories.embedding` exists for the name comparison and it is the weaker half — 46 of 58 topics have no sub-text, so each vector is one generic word, and "Faith" and "Prayer" sit near the middle of everything a church publication says. Writing a one-line description for those 46 is the cheapest improvement available to this feature |
| 2026-09-17 | Suggestions are never applied automatically, and say **why** in checkable terms | 56% is a useful prompt and nowhere near good enough to file on. "6 of the 15 most similar materials are filed here" can be checked in a second; a confidence number can only be taken or left |
| 2026-09-17 | `@huggingface/transformers`, `onnxruntime-node` and `tesseract.js` join `mupdf` and `sharp` in `build.external` | Same reason and the same trap: native `.node` binaries and wasm cannot be bundled, and a missing one builds cleanly and fails at runtime |
| 2026-09-17 | Adding materials is a **queue with per-file fields**, not one form repeated, and not one set of fields for the batch | A folder of scans routinely holds several authors, so batch-level author and topics would flatten a real distinction. *Apply to all* fills rows left empty and never overwrites an answered one. No field became optional: the title is inferred from the filename, which is where most of this archive's titles came from |
| 2026-09-17 | Browser uploads use `XMLHttpRequest`, not `fetch` | `fetch` cannot report upload progress at all. On a phone a 13 MB photograph is thirty seconds of a control that looks frozen, and a frozen control is one people press again |
| 2026-09-17 | Three uploads at a time, not all of them | Fifty parallel PUTs over one phone's uplink finish no sooner in total and make all fifty look stalled at once |
| 2026-09-17 | Sync is Owner-only, one run at a time, and publishes nothing | Larger blast radius than merging a topic, which is already Owner-only. Two concurrent runs would both see the same file as new and stage it twice — how the backfill left 27 materials stuck. §6 stage 8 allows Drive files to publish themselves; that was written when Drive *was* the v1 archive, already in print for years, which a folder someone drops a file into today is not |
| 2026-09-17 | The Drive client is hand-rolled over `fetch` and `node:crypto` rather than `googleapis` | Two HTTP calls and an RS256 signature. The read-only rule is enforced three ways rather than intended: the scope requested is `drive.readonly` so a token minted from it cannot write, every request is a GET, and no function in the module could express a write. The service account must have **Viewer and nothing more** — with Editor, the only thing between this project and a write to Drive is the code rather than the permission |
| 2026-09-17 | Social images take their geometry from `components/public/logo.tsx` and are **checked against a screenshot of the real logo** | Three surfaces were drawing three different marks, and the material share card was not drawing the logo at all. Measuring caught two errors that looked right: the SVG element had been sized to the arc path's span, ignoring the stroke that overhangs it by two units on each side, and the gap to the word cannot be read off `logo.tsx` at all — there they share a coordinate space, here the word is a text node carrying its own ascender |
| 2026-09-16 | OCR line geometry is emitted by Swift; reading order is rebuilt in TypeScript | Ordering inside `vision-ocr.swift` could not be tested without a Mac and an image. As a pure module the awkward layouts — two columns, three, a byline in the gutter, a line Vision ran across it — are testable, which mattered: the fix took six attempts and every wrong turn came from reasoning about the geometry instead of measuring it |
