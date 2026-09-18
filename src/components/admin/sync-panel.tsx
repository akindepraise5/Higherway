"use client"

import { AlertTriangle, RefreshCw, Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { timeAgo, who } from "../../lib/when"
import { clearStuckSync, startSync } from "../../server/services/sync"
import type { OpenRun, SyncRun } from "../../server/sync/queries"
import { TableScroll } from "./table-scroll"

/**
 * The Sync button, and what every press of it did.
 *
 * Three buttons, and the order is the advice. **Check the folder** is a dry run:
 * it lists what would be pulled and imports nothing. **Bring in five** proves the
 * pipeline on a handful. **Pull in everything new** commits to the rest.
 *
 * A sync adds material to a public archive that nobody has looked at, and being
 * able to see the answer before committing to it is the difference between a
 * button people press and one they avoid.
 *
 * The page does not poll. A run over a folder of hundreds takes minutes, and a
 * page that reloads itself every few seconds is a page nobody can read the
 * history on. Refresh is a button, and it says so.
 */

export function SyncPanel({
  configured,
  runs,
  running,
}: {
  /** Drive credentials present. Without them the buttons explain rather than fail. */
  configured: boolean
  runs: SyncRun[]
  running: OpenRun | null
}) {
  const [pending, start] = useTransition()
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const router = useRouter()

  const run = (action: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const result = await action()
      setNotice({
        ok: result.ok,
        text: result.ok ? (result.message ?? "Done.") : (result.error ?? "That did not work."),
      })
      router.refresh()
    })

  /**
   * When to offer clearing it.
   *
   * Immediately for a run Trigger says is queued or already gone — those are
   * facts, not guesses, and making someone wait an hour to act on a fact is the
   * interface being stubborn. Only a run that is genuinely executing, or one
   * Trigger could not be asked about, gets the benefit of the doubt, and that
   * runs out after ten minutes.
   */
  const age = running ? Date.now() - new Date(running.startedAt).getTime() : 0
  const stuck =
    running !== null &&
    (running.state === "queued" || running.state === "gone" || age > 10 * 60_000)

  if (!configured) {
    return (
      <div className="mt-8 max-w-2xl rounded-[4px] border-l-2 border-gold bg-paper-2 px-5 py-4">
        <p className="text-[14px] leading-relaxed text-ink-2">
          Drive is not connected yet. It needs a Google service account with{" "}
          <strong className="font-medium">read</strong> access to the folder, and the folder id —{" "}
          <span className="font-mono text-[13px]">GOOGLE_SERVICE_ACCOUNT_EMAIL</span>,{" "}
          <span className="font-mono text-[13px]">GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY</span> and{" "}
          <span className="font-mono text-[13px]">GOOGLE_DRIVE_FOLDER_ID</span>.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-taupe">
          Read access, and only read access. Nothing in this project writes to Drive — no uploads,
          no renames, no deletions — and the permission it asks Google for could not authorise one.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || running !== null}
          onClick={() => run(() => startSync({ dryRun: true }))}
          className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-[13.5px] text-ink-2 transition-colors hover:border-ink disabled:opacity-40"
        >
          <Search size={15} />
          Check the folder
        </button>

        {/* Five first, and it is the button to press on a folder nobody has
            synced before. The folder holds 796 PDFs of which 148 are new; a
            sync started while nothing is consuming the queue stages every one
            of them with no worker to read them. Five either produces five
            finished materials or proves the pipeline is not running, and both
            answers beat 148 rows in limbo. */}
        <button
          type="button"
          disabled={pending || running !== null}
          onClick={() => run(() => startSync({ limit: 5 }))}
          className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-[13.5px] text-ink-2 transition-colors hover:border-ink disabled:opacity-40"
        >
          Bring in five, to start
        </button>

        <button
          type="button"
          disabled={pending || running !== null}
          onClick={() => run(() => startSync())}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[13.5px] font-medium text-paper-2 transition-colors hover:bg-forest-2 disabled:opacity-40"
        >
          <RefreshCw size={15} className={running ? "animate-spin" : ""} />
          {running ? "A sync is running" : "Pull in everything new"}
        </button>

        {running ? (
          <button
            type="button"
            onClick={() => router.refresh()}
            className="text-[13px] text-taupe underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            Refresh
          </button>
        ) : null}
      </div>

      {notice ? (
        <p
          role="status"
          className={`mt-3 text-[13.5px] ${notice.ok ? "text-ink-3" : "text-[#8c2f22]"}`}
        >
          {notice.text}
        </p>
      ) : null}

      {stuck && running ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[4px] border-l-2 border-[#8c2f22] bg-paper-2 px-4 py-3">
          <AlertTriangle size={15} className="flex-none text-[#8c2f22]" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-[13px] text-ink-2">
            {running.state === "queued" ? (
              <>
                A sync has been <strong className="font-medium">waiting in the queue</strong> since{" "}
                {timeAgo(new Date(running.startedAt))} — nothing has picked it up, which means no
                worker is deployed to run these tasks. Deploy them, then clear this and try again.
              </>
            ) : running.state === "gone" ? (
              <>
                The run behind this sync has finished or failed without reporting back. Clear it to
                start another.
              </>
            ) : (
              <>
                A sync started {timeAgo(new Date(running.startedAt))} and has not reported. Until it
                is cleared, no other sync can start.
              </>
            )}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => clearStuckSync(running.id))}
            className="flex-none rounded-full border border-line px-3.5 py-1.5 text-[12.5px] text-ink-2 transition-colors hover:border-ink disabled:opacity-40"
          >
            Clear it
          </button>
        </div>
      ) : null}

      <h2 className="mt-10 text-[11px] font-medium uppercase tracking-[.2em] text-taupe">
        Every run
      </h2>

      {runs.length === 0 ? (
        <p className="mt-3 text-[14px] text-ink-3">
          Nothing has been synced yet. Start with <em>Check the folder</em> — it imports nothing.
        </p>
      ) : (
        <TableScroll minWidth="46rem" className="mt-3">
          <thead>
            <tr className="border-b border-line-soft bg-paper-2 text-[11px] font-medium uppercase tracking-[.14em] text-taupe">
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Who</th>
              <th className="px-4 py-3 font-medium">Brought in</th>
              <th className="px-4 py-3 font-medium">Left alone</th>
              <th className="px-4 py-3 font-medium">Held back</th>
              <th className="px-4 py-3 font-medium">Failed</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((entry) => (
              <RunRow key={entry.id} entry={entry} />
            ))}
          </tbody>
        </TableScroll>
      )}
    </div>
  )
}

function RunRow({ entry }: { entry: SyncRun }) {
  const [open, setOpen] = useState(false)
  /** Only the outcomes worth reading. "already here" is most of them. */
  const notable = entry.detail.filter((d) => d.result !== "skipped" || d.why !== "already here")

  return (
    <>
      <tr className="border-b border-line-soft last:border-0">
        <td className="px-4 py-3 text-[13px]">
          {timeAgo(entry.startedAt)}
          {entry.finishedAt === null ? (
            <span className="mt-0.5 block text-[11.5px] text-gold">still running</span>
          ) : null}
          {notable.length > 0 ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="mt-0.5 block text-[11.5px] text-taupe underline-offset-2 hover:text-ink hover:underline"
            >
              {open ? "hide" : `${notable.length} worth reading`}
            </button>
          ) : null}
        </td>
        <td className="px-4 py-3 text-[12.5px] text-taupe">{who(entry.byName, entry.byEmail)}</td>
        <td className="px-4 py-3 text-[13px] text-ink-2">{entry.imported}</td>
        <td className="px-4 py-3 text-[13px] text-ink-3">{entry.skipped}</td>
        <td className="px-4 py-3 text-[13px] text-gold">{entry.flagged}</td>
        <td
          className={`px-4 py-3 text-[13px] ${entry.failed > 0 ? "text-[#8c2f22]" : "text-ink-3"}`}
        >
          {entry.failed}
        </td>
      </tr>

      {open ? (
        <tr className="border-b border-line-soft bg-paper-2">
          <td colSpan={6} className="px-4 py-3">
            {entry.error ? (
              <p className="mb-2 text-[12.5px] text-[#8c2f22]">{entry.error}</p>
            ) : null}
            <ul className="flex flex-col gap-1">
              {notable.map((item) => (
                <li key={item.driveId} className="text-[12px] leading-snug">
                  <span className="text-ink-2">{item.file}</span>
                  <span className="text-taupe"> — {item.why ?? item.result}</span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      ) : null}
    </>
  )
}
