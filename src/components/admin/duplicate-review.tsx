"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import type { DuplicatePair, PairSide } from "../../server/duplicates/queries"
import { dismissPair, resolvePair } from "../../server/services/duplicates"
import { ConfirmDialog } from "./confirm-dialog"

/**
 * Reviewing one possible duplicate at a time.
 *
 * Both materials are shown side by side with their first page, because the
 * quickest way to tell two scans apart is to look at them. The reasons the pair
 * was raised are printed in words rather than as a score, so the decision rests
 * on evidence rather than on a number someone has to trust.
 *
 * Keeping one archives the other, so it goes through the confirmation dialog.
 * Saying they are different does not, since that only records a judgement and
 * can be reconsidered by raising the pair again.
 */

const fmtBytes = (n: number | null) =>
  n === null
    ? "—"
    : n > 1024 * 1024
      ? `${(n / 1024 / 1024).toFixed(1)} MB`
      : `${Math.round(n / 1024)} KB`

function Side({ side, onKeep, busy }: { side: PairSide; onKeep: () => void; busy: boolean }) {
  return (
    <div className="flex flex-col rounded-[3px] border border-line-soft bg-paper">
      <div className="aspect-[5/7] overflow-hidden bg-paper-3">
        {side.firstPageUrl ? (
          /* biome-ignore lint/performance/noImgElement: already sized by our pipeline, served free from R2 */
          <img
            src={side.firstPageUrl}
            alt={`First page of ${side.title}`}
            loading="lazy"
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-[12.5px] text-taupe">
            Not processed yet — no page to show
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-serif text-[17px] leading-snug">{side.title}</h3>

        <dl className="mt-3 space-y-1 text-[12.5px] text-ink-3">
          <div className="flex justify-between gap-3">
            <dt className="text-taupe">Author</dt>
            <dd>{side.author ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-taupe">Pages</dt>
            <dd>{side.pageCount ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-taupe">Size</dt>
            <dd>{fmtBytes(side.byteSize)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-taupe">Topics</dt>
            <dd className="text-right">
              {side.topics.length > 0 ? side.topics.join(", ") : "Uncategorised"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-taupe">Added</dt>
            <dd>{new Date(side.createdAt).toLocaleDateString()}</dd>
          </div>
        </dl>

        <button
          type="button"
          disabled={busy}
          onClick={onKeep}
          className="mt-4 w-full rounded-full bg-ink px-4 py-2.5 text-[13.5px] font-medium text-paper-2 transition-colors hover:bg-forest-2 disabled:opacity-50"
        >
          Keep this one
        </button>
      </div>
    </div>
  )
}

export function DuplicateReview({ pairs }: { pairs: DuplicatePair[] }) {
  const [pending, start] = useTransition()
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [staged, setStaged] = useState<{
    pair: DuplicatePair
    keep: PairSide
    drop: PairSide
  } | null>(null)
  const router = useRouter()

  const run = (action: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const result = await action()
      setNotice({
        ok: result.ok,
        text: result.ok ? (result.message ?? "Done.") : (result.error ?? "That did not work."),
      })
      if (result.ok) router.refresh()
    })

  return (
    <div className="mt-8">
      {notice ? (
        <p
          role="status"
          className={`mb-6 rounded-[3px] border-l-2 px-4 py-3 text-[13.5px] ${
            notice.ok
              ? "border-forest bg-paper-2 text-ink-2"
              : "border-[#8c2f22] bg-[#8c2f22]/5 text-[#8c2f22]"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      <div className="space-y-10">
        {pairs.map((pair) => {
          const reasons = (pair.signals.reasons as string[] | undefined) ?? []
          return (
            <section key={pair.id} className="rounded-[3px] border border-line-soft bg-paper-2 p-4">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-[62ch]">
                  <p className="text-[11px] font-medium uppercase tracking-[.16em] text-taupe">
                    Why this was raised
                  </p>
                  {reasons.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-[13.5px] text-ink-2">
                      {reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[13.5px] text-ink-2">
                      The titles are close enough to be worth a look.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => dismissPair(pair.id))}
                  className="rounded-full border border-line px-4 py-2 text-[13px] text-ink-2 transition-colors hover:border-ink disabled:opacity-50"
                >
                  These are different
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Side
                  side={pair.a}
                  busy={pending}
                  onKeep={() => setStaged({ pair, keep: pair.a, drop: pair.b })}
                />
                <Side
                  side={pair.b}
                  busy={pending}
                  onKeep={() => setStaged({ pair, keep: pair.b, drop: pair.a })}
                />
              </div>
            </section>
          )
        })}
      </div>

      <ConfirmDialog
        open={staged !== null}
        busy={pending}
        title="Keep this one?"
        confirmLabel="Keep it"
        description={
          staged ? (
            <>
              <b>{staged.keep.title}</b> stays in the library. <b>{staged.drop.title}</b> is
              archived and marked as a copy of it.
              {staged.drop.topics.length > 0 ? (
                <>
                  {" "}
                  Its topics ({staged.drop.topics.join(", ")}) move across, so no filing is lost.
                </>
              ) : null}{" "}
              Nothing is deleted — the archived one can be restored.
            </>
          ) : null
        }
        onCancel={() => setStaged(null)}
        onConfirm={() => {
          if (!staged) return
          const { pair, keep } = staged
          setStaged(null)
          run(() => resolvePair(pair.id, keep.id))
        }}
      />
    </div>
  )
}
