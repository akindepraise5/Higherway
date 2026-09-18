"use client"

import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

/**
 * Tells you when something you added has finished being read.
 *
 * Adding a material used to end with "it is being read now" and then silence —
 * the drawer closed and the material appeared on some later refresh, or did not,
 * and nothing said which. Rows are created the moment the bytes land now, so
 * there is something to watch; this is the part that watches it.
 *
 * **It polls only while there is something in flight, and stops on its own.**
 * A page that reloads itself on a timer is a page nobody can read — the earlier
 * decision not to poll the sync history stands for exactly that reason. The
 * difference here is that the condition is specific and self-clearing: `staged`
 * and `processing` are transient states, so the interval has a guaranteed end.
 *
 * It backs off, too. A pipeline stage takes seconds; a worker that is not
 * running takes for ever, and hammering the database every three seconds for an
 * hour to learn nothing is worse than asking every half minute. After five
 * minutes it stops asking altogether and says so — at that point the answer is
 * not "wait longer", it is that nothing is processing these, which is a thing to
 * go and look at rather than watch.
 */

/** Start here, and widen towards the cap. Seconds. */
const FIRST = 3
const CAP = 30
/** After this, stop and say something useful instead. */
const GIVE_UP_AFTER = 5 * 60 * 1000

export function InFlight({ count }: { count: number }) {
  const router = useRouter()
  const [waited, setWaited] = useState(0)
  const [stopped, setStopped] = useState(false)

  useEffect(() => {
    if (count === 0) {
      // Reset, so a second upload after a quiet spell gets the fast interval
      // again rather than inheriting the last one's patience.
      setWaited(0)
      setStopped(false)
      return
    }
    if (stopped) return

    const seconds = Math.min(CAP, FIRST * 2 ** Math.floor(waited / 30_000))
    const timer = setTimeout(() => {
      const next = waited + seconds * 1000
      if (next >= GIVE_UP_AFTER) {
        setStopped(true)
        return
      }
      setWaited(next)
      router.refresh()
    }, seconds * 1000)

    return () => clearTimeout(timer)
  }, [count, waited, stopped, router])

  if (count === 0) return null

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[4px] border-l-2 border-gold bg-paper-2 px-4 py-3">
      {stopped ? null : <Loader2 size={14} className="animate-spin text-gold" aria-hidden="true" />}
      <p role="status" className="text-[13.5px] text-ink-2">
        {count === 1 ? "1 material is" : `${count} materials are`} waiting to be read.
        {stopped ? null : " This page will update on its own."}
      </p>

      {stopped ? (
        <>
          <p className="text-[12.5px] text-taupe">
            Nothing has changed in five minutes, so this has stopped checking — it usually means no
            worker is running the pipeline.
          </p>
          <button
            type="button"
            onClick={() => {
              setWaited(0)
              setStopped(false)
              router.refresh()
            }}
            className="text-[12.5px] text-ink-3 underline-offset-2 transition-colors hover:text-ink hover:underline"
          >
            Check again
          </button>
        </>
      ) : null}
    </div>
  )
}
