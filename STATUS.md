# Status

Living record of where Higherway v2 stands. Update it in the same change as the work.

**Updated:** 2026-09-16
**Now:** Phase 0 — scaffold green (lint, typecheck, test, build all pass); shadcn and CI remaining
**Branch:** work happens on `v2`; `main` keeps serving the current site until v2 matches it

---

## Where things stand

| | |
|---|---|
| Docs | `CLAUDE.md`, `ARCHITECTURE.md`, `STATUS.md` written |
| Code | Next.js 16.3 scaffold on the `v2` branch, verified green. `main` still serves v1 |
| Materials | 651 in the spreadsheet, all with a valid Drive link, ~3.5 GB |
| Categories | 69 real topics found; 367 materials (56%) have none |
| Duplicates | 62 exact-title groups covering 132 rows; 69 groups ignoring case and punctuation |
| Decided | R2 is the truth, sync is manual and one-way, OCR is free (see `ARCHITECTURE.md` §13) |

---

## Needed from the owner

Free accounts — dummy values sit in `.env.example` until these arrive. None of them
block the start of the work.

- [ ] Neon database
- [ ] Cloudflare R2 bucket + credentials
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
- [ ] Drizzle schema (`ARCHITECTURE.md` §5), `pgvector` + `pg_trgm`
- [ ] R2 client, storage keys, presigned uploads
- [ ] `scripts/import-sheet.ts` — seed records and the 69 categories
- [ ] `lib/pdf` — render pages, extract embedded text
- [ ] `scripts/backfill.ts` — all 651 from Drive into R2, processed
- [ ] Local embeddings (`bge-small-en-v1.5`, 384 dimensions)

### Phase 2 — Public site on the new data
- [ ] Home, library, topic pages, about — matching v1 feature for feature
- [ ] Covers ported to `lib/art/`, server-rendered, unit tested
- [ ] Material page `/m/[slug]` + reader drawer
- [ ] Hybrid search (full text + fuzzy titles + meaning)
- [ ] SEO: sitemap, structured data, social images, redirects from old `#/` links

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
