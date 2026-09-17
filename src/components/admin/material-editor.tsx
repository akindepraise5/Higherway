"use client"

import { Pencil, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import {
  archiveMaterial,
  publishMaterial,
  setTextPublic,
  unarchiveMaterial,
  updateMaterial,
} from "../../server/services/materials"
import { AuthorSelect } from "./author-select"
import { ConfirmDialog } from "./confirm-dialog"

/**
 * Correcting a material, and deciding whether it is in the library.
 *
 * A pencil beside the title, opening a drawer. Editing is occasional — most
 * visits to this page are to read a material or file it — so the form should
 * not take up the page for everyone who is not using it.
 *
 * Built on the native <dialog> like `confirm-dialog.tsx` and `page-reader.tsx`:
 * focus trapping and Escape without a library. It opens as a panel down the
 * right-hand side rather than a centred box, because it is a work surface
 * beside the material, not an interruption.
 *
 * The two halves are gated differently on the server and shown differently
 * here: anyone may correct details, while publishing and archiving are Admin
 * work, because they decide what the archive says in public.
 */

type Props = {
  materialId: string
  title: string
  author: string | null
  /** Names already in use, so the same person is not spelled two ways. */
  authors: { name: string; count: number }[]
  summary: string | null
  status: string
  archived: boolean
  hasFile: boolean
  textPublic: boolean
  canModerate: boolean
}

type Notice = { ok: boolean; text: string } | null

export function MaterialEditor({
  materialId,
  title,
  author,
  authors,
  summary,
  status,
  archived,
  hasFile,
  textPublic,
  canModerate,
}: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const ref = useRef<HTMLDialogElement>(null)

  const [nextTitle, setNextTitle] = useState(title)
  const [nextAuthor, setNextAuthor] = useState(author ?? "")
  const [nextSummary, setNextSummary] = useState(summary ?? "")

  const [confirming, setConfirming] = useState<null | "archive" | "publish">(null)
  const [reason, setReason] = useState("")

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  const run = async (action: () => Promise<{ ok: boolean; message?: string; error?: string }>) => {
    setBusy(true)
    const result = await action()
    setBusy(false)
    setNotice({
      ok: result.ok,
      text: result.ok ? (result.message ?? "Done.") : (result.error ?? "That did not work."),
    })
    if (result.ok) setConfirming(null)
  }

  const dirty =
    nextTitle.trim() !== title ||
    nextAuthor.trim() !== (author ?? "") ||
    nextSummary.trim() !== (summary ?? "")

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Edit this material"
        title="Edit this material"
        className="mt-1.5 grid h-9 w-9 flex-none place-items-center rounded-full border border-line text-ink-3 transition-colors hover:border-ink hover:text-ink"
      >
        <Pencil size={15} />
      </button>

      <dialog
        ref={ref}
        onCancel={(e) => {
          e.preventDefault()
          setOpen(false)
        }}
        aria-label="Edit this material"
        className="m-0 ml-auto h-[100dvh] max-h-none w-[min(94vw,32rem)] max-w-none border-l border-line bg-paper p-0 text-ink backdrop:bg-forest/40 backdrop:backdrop-blur-[2px]"
      >
        <div className="flex h-full flex-col">
          <div className="flex flex-none items-start justify-between gap-4 border-b border-line-soft px-6 py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">
                Editing
              </p>
              <p className="mt-1 truncate font-serif text-[17px]">{title}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="grid h-8 w-8 flex-none place-items-center rounded-full text-taupe transition-colors hover:bg-paper-2 hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                run(() =>
                  updateMaterial(materialId, {
                    title: nextTitle,
                    author: nextAuthor,
                    summary: nextSummary,
                  }),
                )
              }}
            >
              <label htmlFor="title" className="block text-[13px] text-ink-2">
                Title
              </label>
              <input
                id="title"
                value={nextTitle}
                onChange={(e) => setNextTitle(e.target.value)}
                className="mt-1.5 w-full rounded-[4px] border border-line bg-paper-2 px-3.5 py-2.5 text-[14.5px] outline-none transition-colors focus:border-ink"
              />
              <p className="mt-1.5 text-[12px] text-taupe">
                Many titles came from filenames. The public URL does not change when you fix one.
              </p>

              <label htmlFor="author" className="mt-5 block text-[13px] text-ink-2">
                Author
              </label>
              {/* Picked rather than typed. The library filters authors by
                  *exact* match, so "Rev Darrel Lee" and "Rev. Darrel Lee" are
                  two authors with half the materials each and neither findable
                  from the other. A new name can still be added from here. */}
              <div className="mt-1.5">
                <AuthorSelect
                  id="author"
                  authors={authors}
                  value={nextAuthor}
                  onChange={setNextAuthor}
                />
              </div>

              <label htmlFor="summary" className="mt-5 block text-[13px] text-ink-2">
                Summary
              </label>
              <textarea
                id="summary"
                value={nextSummary}
                onChange={(e) => setNextSummary(e.target.value)}
                rows={4}
                placeholder="A sentence or two. Shown on the material's page and in search results."
                className="mt-1.5 w-full resize-y rounded-[4px] border border-line bg-paper-2 px-3.5 py-2.5 text-[14.5px] leading-relaxed outline-none transition-colors focus:border-ink"
              />

              <button
                type="submit"
                disabled={busy || !dirty}
                className="mt-4 rounded-full bg-ink px-5 py-2.5 text-[13.5px] font-medium text-paper-2 transition-colors hover:bg-forest-2 disabled:opacity-40"
              >
                {busy ? "Saving…" : "Save details"}
              </button>
            </form>

            <div className="mt-7 border-t border-line-soft pt-5">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={textPublic}
                  disabled={busy}
                  onChange={(e) => run(() => setTextPublic(materialId, e.target.checked))}
                  className="mt-0.5 h-4 w-4 flex-none accent-[#1A231E]"
                />
                <span>
                  <span className="block text-[13.5px] text-ink-2">
                    Show the read text publicly
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-taupe">
                    It is what makes a photographed page findable on Google. Turn it off when a read
                    has come out badly, until it can be run again.
                  </span>
                </span>
              </label>
            </div>

            {canModerate ? (
              <div className="mt-7 border-t border-line-soft pt-5">
                <h2 className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">
                  In the library
                </h2>
                <p className="mt-2 text-[13px] text-ink-3">
                  This material is <span className="text-ink">{status}</span>.
                </p>

                <div className="mt-4 flex flex-wrap gap-2.5">
                  {!archived && status !== "published" ? (
                    <button
                      type="button"
                      disabled={busy || !hasFile}
                      onClick={() => setConfirming("publish")}
                      className="rounded-full bg-ink px-5 py-2.5 text-[13.5px] font-medium text-paper-2 transition-colors hover:bg-forest-2 disabled:opacity-40"
                    >
                      Publish
                    </button>
                  ) : null}

                  {!archived ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirming("archive")}
                      className="rounded-full border border-line px-5 py-2.5 text-[13.5px] transition-colors hover:border-[#8c2f22] hover:text-[#8c2f22] disabled:opacity-40"
                    >
                      Take out of the library
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => unarchiveMaterial(materialId))}
                      className="rounded-full border border-line px-5 py-2.5 text-[13.5px] transition-colors hover:border-ink disabled:opacity-40"
                    >
                      Restore it
                    </button>
                  )}
                </div>

                {!hasFile && status !== "published" ? (
                  <p className="mt-3 text-[12.5px] text-taupe">
                    There is no file in storage for this one yet, so it cannot be published.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {notice ? (
            <p
              role="status"
              className={`flex-none border-t border-line-soft px-6 py-3 text-[13px] ${
                notice.ok ? "text-ink-3" : "text-[#8c2f22]"
              }`}
            >
              {notice.text}
            </p>
          ) : null}
        </div>
      </dialog>

      <ConfirmDialog
        open={confirming === "publish"}
        title="Publish this material?"
        description="It becomes readable by anyone, and appears in the library and in search engines."
        confirmLabel="Publish"
        destructive={false}
        busy={busy}
        onConfirm={() => run(() => publishMaterial(materialId))}
        onCancel={() => setConfirming(null)}
      />

      <ConfirmDialog
        open={confirming === "archive"}
        title="Take it out of the library?"
        description={
          <>
            <p>
              It stops being public straight away. Nothing is deleted, and it can be restored — but
              whoever finds it later will only have what you write here to go on.
            </p>
            <label htmlFor="archive-reason" className="mt-4 block text-[12.5px] text-ink-3">
              Why is it being archived?
            </label>
            <input
              id="archive-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoComplete="off"
              placeholder="A duplicate of another material, a bad scan…"
              className="mt-2 w-full rounded border border-line bg-paper-2 px-3 py-2.5 text-[14px] outline-none transition-colors focus:border-ink"
            />
          </>
        }
        confirmLabel="Take it out"
        busy={busy}
        onConfirm={() => run(() => archiveMaterial(materialId, reason))}
        onCancel={() => {
          setConfirming(null)
          setReason("")
        }}
      />
    </>
  )
}
