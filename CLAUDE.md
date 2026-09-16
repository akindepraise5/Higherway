# Working in this repository

Higherway is a public archive of a church publication: 651 PDFs, free to read and
download, with an admin panel for adding and curating them.

**Before you touch anything:**

1. Read `ARCHITECTURE.md`. It is the source of truth for structure and decisions.
2. Read `STATUS.md`. It says what is done, what is being built, and what is next.
3. When you finish a piece of work, update `STATUS.md` in the same change.

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

# local-only, run on a Mac (see ARCHITECTURE.md §7)
pnpm import:sheet        # one-time: seed records from the v1 spreadsheet
pnpm backfill            # Drive → R2 → process, the whole archive
pnpm ocr:local           # re-read the queue with macOS Vision
```

---

## The rules that matter

**Never write to Google Drive.** Drive is a read-only inbox. No uploads, no renames,
no deletions, ever. If a task seems to need it, it is the wrong task — raise it.

**Every mutation goes through `src/server/services/`,** and writes its `audit_log` row
in the same transaction as the change. A change that cannot be audited must not happen.
Do not mutate from a route handler, a component or a Trigger task directly.

**Two database handles, and the difference is not cosmetic:**

| Import | Driver | Use for |
|---|---|---|
| `db` from `src/db` | Neon HTTP | Reads. One request, no pool, nothing held open. |
| `txdb` from `src/db/tx` | Neon WebSocket pool | **Every mutation.** Real transactions. |

The HTTP driver has *no transaction support* — `db.transaction()` throws
"No transactions support in neon-http driver". It does not warn; a service written
against `db` would simply have no atomicity, and an audit entry could persist while
the change it describes did not. Mutations use `txdb`.

**`src/lib/` is pure.** No database, no network, no `process.env`. If a module in `lib/`
needs any of those, it belongs in `server/` or `trigger/`. This is what keeps duplicate
detection, cover art and text handling testable without infrastructure.

**Nothing is deleted.** Archiving is a soft state with a reason and an actor. Only an
Owner can destroy anything, and it is a deliberate, separate action.

**Free tier first.** Every service in the stack is on a free plan, and the project must
work with no AI credentials at all. Before adding a paid dependency, say so explicitly
and explain why free does not work. `ARCHITECTURE.md` §3 records where the limits are.

**Secrets never land in the repo.** Add the key to `.env.example` with a dummy value and
a comment saying where to obtain it.

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

**Animation**: `motion` (imported from `motion/react`), used where it explains something
— a drawer opening, a list settling. Honour `prefers-reduced-motion`. A page should be
legible and usable with animation disabled.

**Database**: Drizzle. Schema lives in `src/db/schema/`, one file per area. Never
hand-edit a generated migration. Index anything you filter or sort on.

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

---

## Testing expectations

Unit tests are required for anything in `lib/`: duplicate scoring and title
normalisation, text chunking and quality scoring, cover-art determinism (the same input
must always produce the same cover), search rank fusion.

End-to-end tests cover the flows that would hurt most if they broke: invite → set
password → sign in; upload → duplicate flagged → review; search → open reader → download.

`pnpm build`, `pnpm typecheck` and `pnpm test` all pass before anything is called done.

---

## Definition of done

- [ ] Types check, lint passes, tests pass, the build succeeds
- [ ] Every mutation is audited
- [ ] Public pages ship no unnecessary client JavaScript
- [ ] Works on a phone, and with a keyboard
- [ ] `STATUS.md` updated
- [ ] `ARCHITECTURE.md` updated if the structure changed

---

## Git

Work happens on the `v2` branch with Vercel preview deployments. `main` keeps serving
the current site until v2 is at least as good. Commit messages say why, not what.
Never commit `.env*` files other than `.env.example`.
