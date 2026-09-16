# Higherway

A public archive of a church publication — 651 materials, free to read in the browser and
free to download — with an admin panel for adding and curating them.

Next.js 16 · React 19 · TypeScript · Tailwind 4 · Neon Postgres · Cloudflare R2 ·
Trigger.dev

---

## Start here

```bash
pnpm install
cp .env.example .env.local     # every key says where to obtain it
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Adding a material also needs a background worker in a second terminal:

```bash
npx trigger.dev@latest login
npx trigger.dev@latest dev
```

---

## Documentation

| | |
|---|---|
| **[docs/ONBOARDING.md](docs/ONBOARDING.md)** | What this is and how it fits together. Read first. |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | The source of truth for structure and decisions, and why each was taken. |
| **[docs/STATUS.md](docs/STATUS.md)** | What is done, what is in flight, what is deliberately not built. |
| **[docs/RUNBOOK.md](docs/RUNBOOK.md)** | Every data script, and the traps. Read before running one against real data. |
| **[CLAUDE.md](CLAUDE.md)** | The rules for changing code here. Loaded automatically by coding agents. |

`docs/legacy/index.html` is v1, kept for reference.

---

## The one rule

> Postgres holds the records. R2 holds the files. Google Drive is a read-only inbox, and
> the application never writes to it.

---

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

All four must pass before a pull request.
