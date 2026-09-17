import type { Metadata } from "next"
import { SyncPanel } from "../../../components/admin/sync-panel"
import { hasDrive } from "../../../lib/env"
import { requireRole } from "../../../lib/session"
import { recentRuns, runningSync } from "../../../server/sync/queries"

/**
 * Pulling from the Drive inbox — Phase 6.
 *
 * **Owner only.** `src/proxy.ts` checks that someone is signed in and nothing
 * more — roles are every page's own job — so `requireRole` here is the guard,
 * and `startSync` checks again for itself rather than trusting that the caller
 * came through this page.
 *
 * Owner because sync adds material to a public archive without anyone having
 * read it, over a whole folder at once. That is a larger blast radius than
 * merging a topic, which is already Owner-only after one stray click moved 42
 * materials out of Faith.
 *
 * Manual, never scheduled. ARCHITECTURE.md §2: a cron that pulls whatever
 * appeared overnight makes Drive an authority over the archive, and Drive is an
 * inbox.
 */
export const metadata: Metadata = {
  title: "Sync",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function SyncPage() {
  await requireRole("owner")

  const [runs, running] = await Promise.all([recentRuns(), runningSync()])

  return (
    <>
      <p className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">Drive</p>
      <h1 className="mt-3 font-serif text-[clamp(28px,3.4vw,38px)] font-light tracking-[-0.02em]">
        Bring in what has been added
      </h1>
      <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-ink-2">
        The Drive folder is an inbox, and it is read-only: nothing here uploads, renames or deletes
        anything in it, ever. A sync copies new PDFs into the archive, renders their pages, reads
        the text, checks them against everything already here, and leaves each one waiting to be
        published — the same path as a file uploaded from the dashboard.
      </p>

      <SyncPanel configured={hasDrive} runs={runs} running={running} />
    </>
  )
}
