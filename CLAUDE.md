# Working in this repository

Higherway is a public archive of a church publication: 651 PDFs, free to read and
download, with an admin panel for adding and curating them.

This file is loaded automatically into every session, so it stays short. The detail
lives in `docs/`.

---

## Read these before you touch anything

| Read | When |
|---|---|
| **`docs/ONBOARDING.md`** | First time in this repo. What it is, how a material comes to exist, how the code is shaped. |
| **`docs/ARCHITECTURE.md`** | Before any change to structure, storage, or a pipeline. The source of truth for decisions and *why* they were taken. |
| **`docs/STATUS.md`** | Before starting work. **Start at its *Resume here* section** — where work stopped, what needs checking, and what comes next. |
| **`docs/RUNBOOK.md`** | **Before running any script against real data.** Every one of them touches the live archive. |

Comments in the code cite sections by document name — "ARCHITECTURE.md §7" means
`docs/ARCHITECTURE.md`, section 7.

**When you finish a piece of work, update `docs/STATUS.md` in the same change.** If a
decision or the structure changed, add it to `docs/ARCHITECTURE.md` §13 as well.

---

## Commands

```bash
pnpm dev                 # development server
pnpm build               # production build — must pass before any PR
pnpm typecheck           # tsc --noEmit
pnpm lint                # biome
pnpm test                # vitest (logic)
pnpm test:e2e            # playwright (flows)

pnpm db:generate         # write a migration from the schema
pnpm db:migrate          # apply migrations
pnpm db:seed             # categories + the first owner account
pnpm db:studio           # browse the database
```

Data and maintenance scripts — **read `docs/RUNBOOK.md` first**, they act on the real
archive: `import:sheet`, `backfill`, `ocr:local`, `fix:names`, `fix:hyphens`,
`scan:duplicates`, `resolve:stuck`, `reinvite`. `ocr:status` is read-only and safe to
run any time.

---

## The rules that matter

**Never write to Google Drive.** Drive is a read-only inbox. No uploads, no renames, no
deletions, ever. If a task seems to need it, it is the wrong task — raise it.

**Every mutation goes through `src/server/services/`,** and writes its `audit_log` row in
the same transaction as the change. A change that cannot be audited must not happen. Do
not mutate from a route handler, a component or a Trigger task directly.

**Two database handles, and the difference is not cosmetic:**

| Import | Driver | Use for |
|---|---|---|
| `db` from `src/db` | Neon HTTP | Reads. One request, no pool, nothing held open. |
| `txdb` from `src/db/tx` | Neon WebSocket pool | **Every mutation.** Real transactions. |

The HTTP driver has *no transaction support* — `db.transaction()` throws "No transactions
support in neon-http driver". It does not warn; a service written against `db` would
simply have no atomicity, and an audit entry could persist while the change it describes
did not.

**`src/lib/` is pure.** No database, no network, no `process.env`. If a module in `lib/`
needs any of those, it belongs in `server/` or `trigger/`. This is what keeps duplicate
detection, cover art and text handling testable without infrastructure.

**Nothing is deleted.** Archiving is a soft state with a reason and an actor. Only an
Owner can destroy anything, and it is a deliberate, separate action.

**Free tier first.** Every service is on a free plan, and the project must work with no AI
credentials at all. Before adding a paid dependency, say so explicitly and explain why
free does not work. `docs/ARCHITECTURE.md` §3 records where the limits are.

**Secrets never land in the repo.** Add the key to `.env.example` with a dummy value and a
comment saying where to obtain it.

**Measure before you conclude.** Several long detours in this project came from trusting
an aggregate query instead of checking one concrete row end to end. A script printing
"done" and exiting 0 is not evidence; the database is. `docs/RUNBOOK.md` lists the traps
that have actually bitten.

---

## Conventions

**TypeScript**: strict. No `any`, no non-null `!` to silence the compiler. Validate every
external input with zod — form submissions, URL parameters, API responses, sheet rows.

**Server Components by default.** Add `"use client"` only for genuine interactivity, and
keep it as far down the tree as possible. Public pages are measured on weight; admin code
must never ship to a public visitor.

**Styling**: Tailwind with the tokens in `src/app/globals.css`. No raw hex values in
components — the paper, ink, forest and gold palette from v1 carries over. shadcn
components are ours to edit once generated.

**Animation**: `motion` (imported from `motion/react`), used where it explains something —
a drawer opening, a list settling. Honour `prefers-reduced-motion`.

**Database**: Drizzle. Schema in `src/db/schema/`, one file per area. Never hand-edit a
generated migration. Index anything you filter or sort on.

**Naming**: files kebab-case, React components PascalCase, database columns snake_case.

**Accessibility**: real headings, real buttons, labelled inputs, visible focus, keyboard
paths through the reader and every dialog.

---

## Where things go

| Adding | Goes in |
|---|---|
| A public page | `src/app/(public)/` |
| An admin page | `src/app/admin/` |
| A background job | `src/trigger/` |
| Anything that changes data | `src/server/services/` |
| Pure logic (dedupe, art, text, OCR interfaces) | `src/lib/` |
| A table | `src/db/schema/`, then `pnpm db:generate` |
| A one-off or Mac-only script | `scripts/` |
| Documentation | `docs/` |

---

## Definition of done

- [ ] Types check, lint passes, tests pass, `pnpm build` succeeds
- [ ] Every mutation is audited
- [ ] Public pages ship no unnecessary client JavaScript
- [ ] Works on a phone, and with a keyboard
- [ ] `docs/STATUS.md` updated
- [ ] `docs/ARCHITECTURE.md` updated if the structure or a decision changed

---

## Git

Work happens on the `v2` branch with Vercel preview deployments. `main` keeps serving the
current site until v2 is at least as good. Commit messages say why, not what. Never commit
`.env*` files other than `.env.example`.

**The gate runs twice, and you should never be the one who finds out from CI.**

| Where | What | When |
|---|---|---|
| `.githooks/pre-push` | lint, typecheck, test, build | every `git push`, locally |
| `.github/workflows/ci.yml` | the same four | every push to `main`/`v2`, every PR |

`pnpm install` points git at `.githooks` for you. Skip the local run deliberately with
`git push --no-verify` — for a work-in-progress branch, not to get a red build past
review.

Vercel builds the app on deploy but runs **only** `next build`: it never runs lint,
typecheck or the tests. It is a deployment, not a gate. Do not treat a green Vercel
preview as evidence the checks passed.
