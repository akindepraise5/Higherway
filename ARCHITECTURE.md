# Higherway — Architecture

> **This file is the source of truth for how Higherway is built.**
> If code and this document disagree, one of them is a bug. Update this file in the
> same change that alters the structure it describes.
>
> Last updated: 2026-09-16

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
| Email | Resend + React Email | Invites and password resets |
| Jobs | Trigger.dev | Runs off Vercel, so no function timeouts on PDF work |
| PDF | `mupdf` (render pages + extract text), `sharp` (WebP) | Both free and local |
| OCR | embedded text → macOS Vision (local) → Google Cloud Vision (server) → tesseract.js | See §7 |
| Suggestions | Cloudflare Workers AI, small instruct model | 10,000 neurons/day free — covers the whole backlog; contractually no training on our content |
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

---

## 4. Repository layout

```
higherway/
├── CLAUDE.md               how to work in this repo (read first)
├── ARCHITECTURE.md         this file — the source of truth
├── STATUS.md               what is done, in progress, and next
├── docs/
│   └── legacy/index.html   the v1 site, kept for reference
├── scripts/                one-off and local-only jobs (run on a Mac)
│   ├── import-sheet.ts     seed records + categories from the Google Sheet
│   ├── backfill.ts         download every Drive file → R2 → process
│   └── ocr-local.ts        re-read the queue with macOS Vision
├── src/
│   ├── app/
│   │   ├── (public)/       home, library, topics/[slug], m/[slug], about
│   │   │   └── @modal/     intercepting route: a material opens in a drawer
│   │   ├── (auth)/         login, invite/[token], forgot + reset password
│   │   ├── admin/          dashboard, materials, categories, duplicates,
│   │   │                   sync, submissions, users, activity
│   │   ├── api/            auth, upload URLs, search
│   │   ├── sitemap.ts, robots.ts, opengraph-image.tsx
│   ├── components/
│   │   ├── ui/             shadcn primitives
│   │   ├── public/         site components
│   │   ├── admin/          panel components
│   │   └── cover/          the generated cover artwork (§9)
│   ├── db/
│   │   ├── schema/         Drizzle tables, one file per area
│   │   ├── migrations/
│   │   └── seed.ts         categories + the first owner account
│   ├── lib/                pure, testable modules — no database access
│   │   ├── art/            cover generation (seeded, deterministic)
│   │   ├── dedupe/         fingerprints, title normalising, scoring
│   │   ├── ocr/            engine interface + implementations
│   │   ├── pdf/            render pages, extract embedded text
│   │   ├── text/           clean, chunk, shingle, quality score
│   │   ├── search/         query building, rank fusion
│   │   ├── drive/          Google Drive reads (never writes)
│   │   ├── r2/             storage keys, presigned URLs
│   │   └── mail/           Resend templates
│   ├── server/
│   │   └── services/       every mutation lives here, each writes an audit entry
│   └── trigger/            Trigger.dev tasks
└── tests/
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
| Similar title | "A Heart Like His" vs "A heart like His (1)" | normalise (strip `2017-01-FTWord-`, `(1)`, `copy of`, case, punctuation) then compare significant words | Flags at ≥ 0.55 |
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
| 2026-09-16 | AI suggestions run on Cloudflare Workers AI, free | 10,000 neurons/day covers the backlog, and their terms forbid training on our content |
| 2026-09-16 | Gemini and Mistral free tiers rejected for suggestions | Both train on free-tier content by default |
| 2026-09-16 | Free vision-language models rejected for OCR | Not OCR engines, and unbenchmarked on pages like ours; Vision is free and scores 97–99% |
| 2026-09-16 | Server-side OCR is Google Cloud Vision, tesseract.js when unset | ~35 pages/month against a 1,000-page free allowance |
| 2026-09-16 | Measured, not assumed: 2.04 GB, ~1,100 pages, 1.68 pages/document | The archive is a seventh of the assumed workload; everything fits free |
| 2026-09-16 | The OCR text is public by default, collapsed, with a per-material switch | It is the only thing that makes the archive findable |
| 2026-09-16 | Public submissions designed into the schema now, built after launch | Keeps the first release focused |
| 2026-09-16 | Roles are strictly nested: Owner ⊃ Admin ⊃ Editor | Simple to explain, simple to check |
| 2026-09-16 | shadcn's semantic tokens are mapped onto the Higherway palette in `globals.css` | A generated component is on-brand immediately, with no per-component overrides. `--background` is paper, `--primary` is ink, `--ring` is gold, the sidebar is forest |
| 2026-09-16 | Geist removed from `layout.tsx`; the faces stay Newsreader + Instrument Sans | `shadcn init` adds Geist bound to `--font-sans`, which silently replaces the v1 typography. **Re-running init reintroduces this — check `layout.tsx` and the `@theme inline` block afterwards** |
