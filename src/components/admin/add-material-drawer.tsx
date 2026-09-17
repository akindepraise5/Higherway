"use client"

import { Plus, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { NewMaterialForm, type PickableTopic } from "./new-material-form"

/**
 * Adding materials without leaving the list.
 *
 * A drawer rather than a page, because adding is something you do *while*
 * looking at the archive: the list stays behind it and refreshes underneath
 * when the materials land. `/admin/materials/new` still works and renders the
 * same form, so a bookmark or a shared link is not broken by this.
 *
 * **A batch did not need a page of its own.** This is already a full-height
 * sheet the width of the viewport on a phone, which is a page in everything but
 * the URL, and the queue scrolls inside it. A second surface would have been two
 * places to keep in step for no gain.
 *
 * **It does not close while an upload is in flight.** The browser uploads
 * straight to R2 and only then hands off to the background job, so a drawer
 * dismissed halfway would leave files sitting in staging with nobody aware of
 * them. Escape and the close button are both refused until the work settles.
 */
export function AddMaterialDrawer({
  jobsConfigured,
  topics,
}: {
  jobsConfigured: boolean
  topics: PickableTopic[]
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  const close = () => {
    if (busy) return
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[13.5px] font-medium text-paper-2 transition-colors hover:bg-forest-2"
      >
        <Plus size={15} />
        Add materials
      </button>

      <dialog
        ref={ref}
        onCancel={(e) => {
          // Escape must not abandon an upload that is already under way.
          e.preventDefault()
          close()
        }}
        aria-label="Add materials"
        className="m-0 ml-auto h-[100dvh] max-h-none w-[min(94vw,34rem)] max-w-none border-l border-line bg-paper p-0 text-ink backdrop:bg-forest/40 backdrop:backdrop-blur-[2px]"
      >
        <div className="flex h-full flex-col">
          <div className="flex flex-none items-start justify-between gap-4 border-b border-line-soft px-6 py-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">
                Add materials
              </p>
              <p className="mt-1 font-serif text-[19px]">
                Put something new in the archive — one file or fifty
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              disabled={busy}
              aria-label="Close"
              title={busy ? "Wait until the uploads have finished" : "Close"}
              className="grid h-8 w-8 flex-none place-items-center rounded-full text-taupe transition-colors hover:bg-paper-2 hover:text-ink disabled:opacity-30"
            >
              <X size={16} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            <NewMaterialForm
              jobsConfigured={jobsConfigured}
              topics={topics}
              onBusyChange={setBusy}
              onDone={() => setOpen(false)}
            />
          </div>
        </div>
      </dialog>
    </>
  )
}
