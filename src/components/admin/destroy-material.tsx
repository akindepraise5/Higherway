"use client"

import { Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { destroyMaterialAction } from "../../server/services/materials"
import { ConfirmDialog } from "./confirm-dialog"

/**
 * The only control in the project that truly deletes archive content.
 *
 * It appears **only on a material that is already archived**, and only to an
 * Owner. That is two deliberate decisions rather than one: archiving asks why
 * and can be undone, and this is the second step, which cannot. A single button
 * taking a live material straight to nothing would put an irreversible act one
 * click away on the same page as a typo fix.
 *
 * It is not styled as a button. A bordered red button beside the others reads as
 * an option of equal standing, and this is not one — it is the thing you do when
 * something should never have been here at all. A quiet line under everything
 * else, that says exactly what will happen.
 */
export function DestroyMaterial({
  materialId,
  title,
  pages,
}: {
  materialId: string
  title: string
  pages: number
}) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  return (
    <div className="mt-8 border-t border-line-soft pt-5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        className="inline-flex items-center gap-2 text-[12.5px] text-taupe underline-offset-2 transition-colors hover:text-[#8c2f22] hover:underline disabled:opacity-40"
      >
        <Trash2 size={13} aria-hidden="true" />
        Destroy this material and its files
      </button>
      <p className="mt-1.5 max-w-[56ch] text-[11.5px] leading-relaxed text-taupe">
        For something that should never have been here. Archiving is reversible; this is not.
      </p>

      {error ? (
        <p role="status" className="mt-2 text-[12.5px] text-[#8c2f22]">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        open={open}
        title="Destroy this material?"
        description={
          <>
            The record and{" "}
            <span className="font-medium">
              {pages === 1 ? "its page image" : `all ${pages} page images`}
            </span>{" "}
            and the original file are deleted from storage. Its filing, its duplicate findings and
            its text go with it.{" "}
            <span className="font-medium">This cannot be undone, and nothing can restore it.</span>{" "}
            The activity trail keeps a record that it existed and that you removed it.
          </>
        }
        confirmLabel="Destroy it"
        /* The title, typed exactly — the same bar as unfiling a whole topic.
           Re-checked on the server, because a confirmation that exists only in
           the browser is a suggestion. */
        confirmPhrase={title}
        busy={pending}
        onConfirm={() => {
          setOpen(false)
          setError(null)
          start(async () => {
            const result = await destroyMaterialAction(materialId, title)
            if (result.ok) router.push("/admin/materials")
            else setError(result.error)
          })
        }}
        onCancel={() => setOpen(false)}
      />
    </div>
  )
}
